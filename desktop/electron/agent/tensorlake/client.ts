/**
 * Tensorlake client — document ingestion + structured extraction.
 *
 * Tensorlake is the "always-on agents" track sponsor for our hackathon.
 * Their cloud parses documents (code repos rendered as digests, PDFs,
 * URLs, raw text) and runs JSON-Schema-driven structured extraction in a
 * single API call. We use it as the bg-execution backbone for the
 * "while you were away" demo beat: angel ingests stephen's portfolio
 * repo digest, tensorlake returns a structured PortfolioObservation, and
 * she greets him with real, specific findings on boot.
 *
 * # API surface (Tensorlake Cloud, v1)
 *
 *   POST   https://api.tensorlake.ai/documents/v1/files          (upload)
 *   POST   https://api.tensorlake.ai/documents/v1/parse          (ingest+kick)
 *   GET    https://api.tensorlake.ai/documents/v1/parse/:jobId   (poll)
 *
 * Auth: `Authorization: Bearer <TENSORLAKE_API_KEY>`. Get a key at
 * tensorlake.ai → dashboard. Free for the hackathon.
 *
 * # Local fallback
 *
 * `TensorlakeMockClient` returns a hand-crafted extraction for the
 * portfolio fixture so the demo never depends on the API being up. The
 * shape it returns is intentionally identical to the real `structured_data`
 * shape — if you swap the client at runtime, downstream code (bg-jobs.ts)
 * doesn't notice.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

/* ------------------------------------------------------------------ */
/* types                                                               */
/* ------------------------------------------------------------------ */

export type IngestSource =
  | { kind: 'fixture'; value: string }
  | { kind: 'url'; value: string }
  | { kind: 'path'; value: string }
  | { kind: 'text'; value: string };

/** JSON Schema (subset) that Tensorlake accepts under structured_extraction_options. */
export interface ExtractionSchema {
  schema_name: string;
  json_schema: Record<string, unknown>;
}

/**
 * One element of the `structured_data` array Tensorlake returns. Shape mirrors
 * docs.tensorlake.ai/document-ingestion/parsing/structured-extraction.
 */
export interface StructuredDataEntry {
  data: Record<string, unknown>;
  page_numbers?: number[];
  schema_name: string;
}

/** Result of a finished parse job — flattened to what we actually consume. */
export interface ExtractionResult {
  jobId: string;
  status: 'success' | 'failure';
  /** Markdown chunks tensorlake produced from the source. We ignore for the
   *  demo but keep the field so a v2 RAG layer can use it. */
  chunks?: string[];
  /** The structured_data array — one entry per applied schema. */
  structured_data: StructuredDataEntry[];
  /** Backend that produced this result — useful for the /admin status pill. */
  backend: 'tensorlake' | 'mock';
}

/* ------------------------------------------------------------------ */
/* contract                                                            */
/* ------------------------------------------------------------------ */

export interface TensorlakeClient {
  /**
   * Submit a source for ingestion. Returns a jobId. For the real backend
   * this is a `POST /parse` (or `/files` then `/parse`); for mock it is a
   * synthetic id we use to look up the canned result.
   */
  ingest(source: IngestSource): Promise<{ jobId: string }>;

  /**
   * Apply the given extraction schema to the previously ingested job and
   * block until the job reaches a terminal state. The real backend polls
   * `GET /parse/:jobId` until `status` is `success` or `failure`.
   */
  extract(jobId: string, schema: ExtractionSchema): Promise<ExtractionResult>;

  /** Health check. */
  ping(): Promise<{ ok: boolean; backend: string; details?: string }>;
}

/* ------------------------------------------------------------------ */
/* fixtures                                                            */
/* ------------------------------------------------------------------ */

/**
 * Resolve the fixture path under both dev (electron-vite serves from
 * `electron/agent/tensorlake/fixtures`) and packaged builds (where
 * fixtures live alongside the bundled main entry under
 * `dist-electron/main/fixtures` or one level up). We try a few
 * candidates so the file is found regardless of layout.
 */
const FIXTURE_CANDIDATES: string[] = [
  // dev (electron-vite watches source tree)
  path.resolve(process.cwd(), 'electron/agent/tensorlake/fixtures'),
  path.resolve(process.cwd(), 'desktop/electron/agent/tensorlake/fixtures'),
  // bundled CJS — __dirname is dist-electron/main; fixtures sit in a sibling
  path.resolve(__dirname, 'fixtures'),
  path.resolve(__dirname, '../../electron/agent/tensorlake/fixtures'),
  path.resolve(__dirname, '../electron/agent/tensorlake/fixtures'),
];

async function readFixture(name: string): Promise<string> {
  let lastErr: unknown;
  for (const dir of FIXTURE_CANDIDATES) {
    const file = path.join(dir, name);
    try {
      return await fs.readFile(file, 'utf8');
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(
    `tensorlake fixture not found: ${name}; tried ${FIXTURE_CANDIDATES.join(', ')} (${String(lastErr)})`,
  );
}

/** Returns the bytes for a source — file/url/text resolved to plain text. */
async function loadSourceBytes(source: IngestSource): Promise<string> {
  switch (source.kind) {
    case 'fixture':
      return readFixture(source.value);
    case 'path':
      return fs.readFile(source.value, 'utf8');
    case 'text':
      return source.value;
    case 'url': {
      const resp = await fetch(source.value);
      if (!resp.ok) throw new Error(`fetch ${source.value} failed: ${resp.status}`);
      return resp.text();
    }
  }
}

/* ------------------------------------------------------------------ */
/* real client                                                         */
/* ------------------------------------------------------------------ */

const TENSORLAKE_BASE = 'https://api.tensorlake.ai/documents/v1';
const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 60_000;

interface ParseResponse {
  jobId: string;
  fileId?: string;
  status?: string;
}

interface ParseJobStatusResponse {
  jobId: string;
  status: 'pending' | 'processing' | 'success' | 'failure' | string;
  chunks?: Array<{ content?: string; text?: string }> | string[];
  structured_data?: StructuredDataEntry[];
  error?: string;
}

export class TensorlakeRealClient implements TensorlakeClient {
  private apiKey: string;
  /** jobId -> extraction options to apply. Tensorlake accepts schemas
   *  inline at /parse time, but we keep our 2-step interface (ingest, then
   *  extract) by deferring the actual /parse POST to extract(). The
   *  intermediate "jobId" we return from ingest() is a local handle that
   *  carries the buffered source bytes through to extract(). */
  private pending = new Map<string, { sourceText: string; sourceLabel: string }>();

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      ...extra,
    };
  }

  async ingest(source: IngestSource): Promise<{ jobId: string }> {
    const text = await loadSourceBytes(source);
    const localId = `tl_local_${randomUUID()}`;
    this.pending.set(localId, { sourceText: text, sourceLabel: `${source.kind}:${source.value}` });
    return { jobId: localId };
  }

  async extract(localJobId: string, schema: ExtractionSchema): Promise<ExtractionResult> {
    const buf = this.pending.get(localJobId);
    if (!buf) throw new Error(`no buffered ingest for jobId ${localJobId}`);
    this.pending.delete(localJobId);

    // POST /parse — submit the text body + structured extraction options.
    // Tensorlake supports `content` (raw text/html) + `mimeType` directly.
    const parseResp = await fetch(`${TENSORLAKE_BASE}/parse`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        content: buf.sourceText,
        mimeType: 'text/plain',
        settings: {
          structured_extraction_options: [
            {
              schema_name: schema.schema_name,
              json_schema: schema.json_schema,
              partition_strategy: 'none',
            },
          ],
        },
      }),
    });

    if (!parseResp.ok) {
      const body = await parseResp.text().catch(() => '');
      throw new Error(`tensorlake parse failed (${parseResp.status}): ${body}`);
    }
    const parsed: ParseResponse = await parseResp.json();
    const remoteJobId = parsed.jobId;
    if (!remoteJobId) throw new Error('tensorlake /parse returned no jobId');

    // Poll GET /parse/:jobId until terminal.
    const start = Date.now();
    while (Date.now() - start < POLL_TIMEOUT_MS) {
      const r = await fetch(`${TENSORLAKE_BASE}/parse/${remoteJobId}`, {
        method: 'GET',
        headers: this.headers(),
      });
      if (!r.ok) {
        const body = await r.text().catch(() => '');
        throw new Error(`tensorlake poll failed (${r.status}): ${body}`);
      }
      const job: ParseJobStatusResponse = await r.json();
      if (job.status === 'success') {
        const rawChunks = job.chunks ?? [];
        const chunks: string[] = rawChunks.map((c) =>
          typeof c === 'string' ? c : c.content ?? c.text ?? '',
        );
        return {
          jobId: remoteJobId,
          status: 'success',
          chunks,
          structured_data: job.structured_data ?? [],
          backend: 'tensorlake',
        };
      }
      if (job.status === 'failure') {
        return {
          jobId: remoteJobId,
          status: 'failure',
          structured_data: [],
          backend: 'tensorlake',
        };
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
    throw new Error(`tensorlake job ${remoteJobId} timed out after ${POLL_TIMEOUT_MS}ms`);
  }

  async ping(): Promise<{ ok: boolean; backend: string; details?: string }> {
    try {
      // tensorlake doesn't publish a /health route; a HEAD on the parse
      // endpoint with a bad body 4xxs but proves auth + reachability.
      const r = await fetch(`${TENSORLAKE_BASE}/parse`, {
        method: 'OPTIONS',
        headers: this.headers(),
      });
      return { ok: r.status < 500, backend: 'tensorlake', details: `OPTIONS /parse → ${r.status}` };
    } catch (err) {
      return { ok: false, backend: 'tensorlake', details: String(err) };
    }
  }
}

/* ------------------------------------------------------------------ */
/* mock client                                                         */
/* ------------------------------------------------------------------ */

/**
 * Returns a hand-crafted extraction whose shape matches what the real
 * tensorlake API produces for the portfolio fixture. The findings here
 * were derived by reading the fixture text — they are *real* observations
 * about a *fixture*, not made up out of thin air. That makes the demo
 * defensible to judges asking "is this really doing the work?".
 */
export class TensorlakeMockClient implements TensorlakeClient {
  private staged = new Map<string, IngestSource>();

  async ingest(source: IngestSource): Promise<{ jobId: string }> {
    const jobId = `tl_mock_${randomUUID()}`;
    this.staged.set(jobId, source);
    // simulate a tiny network round-trip so timings feel real
    await new Promise((r) => setTimeout(r, 60));
    return { jobId };
  }

  async extract(jobId: string, schema: ExtractionSchema): Promise<ExtractionResult> {
    const source = this.staged.get(jobId);
    this.staged.delete(jobId);
    // simulate parse latency (real tensorlake is ~1-3s for a small doc)
    await new Promise((r) => setTimeout(r, 280));

    // Only the portfolio fixture is supported in mock; anything else gets a
    // generic "we don't have a canned answer" result.
    const isPortfolio =
      source?.kind === 'fixture' && source.value.toLowerCase().includes('portfolio');

    if (!isPortfolio) {
      return {
        jobId,
        status: 'success',
        chunks: [],
        structured_data: [
          {
            schema_name: schema.schema_name,
            data: {
              project_summary: 'unknown source — mock client only has canned data for portfolio_repo.txt',
              recent_files: [],
              noteworthy_observations: [],
              suggested_followup: '',
            },
          },
        ],
        backend: 'mock',
      };
    }

    // Hand-crafted result for portfolio_repo.txt — derived from reading the
    // fixture. Same shape Tensorlake's structured_extraction returns.
    return {
      jobId,
      status: 'success',
      chunks: [
        '# stephen-hung/portfolio — repo digest (snapshot 2026-05-09)',
        'next.js 15 / react 19 / tailwind 4 / framer-motion 11; 42 files, 3.1k LOC.',
        'last commit e8f1c2a chore: bump framer-motion to 11.5 (2026-04-22)',
        'TODO(self): add angel project card after hackathon',
      ],
      structured_data: [
        {
          schema_name: schema.schema_name,
          page_numbers: [1],
          data: {
            project_summary:
              "stephen's personal portfolio — next.js 15, framer-motion, vercel-deployed at stephenhung.com. small (3.1k LOC) but the storefront for his work.",
            recent_files: [
              { path: 'src/app/page.tsx', modified: '2026-04-22', note: 'hero + project grid' },
              { path: 'src/components/ProjectCard.tsx', modified: '2026-04-21', note: 'card primitive (used 6x)' },
              { path: 'src/app/now/page.tsx', modified: '2026-04-19', note: '/now status page' },
              { path: 'src/lib/projects.ts', modified: '2026-04-15', note: 'project metadata array' },
            ],
            noteworthy_observations: [
              'no commits in 17 days — last meaningful feature was the /now page on apr 19',
              'ProjectCard has no image slot, so the work grid is visually flat',
              "src/lib/projects.ts has a TODO marker: 'add angel project card after hackathon'",
              'test coverage is 18% overall; HeroGradient and the home page have 0% coverage',
              'production deploy at stephenhung.com is healthy — last build green, 200 on probe',
            ],
            suggested_followup:
              'add an angel project card to src/lib/projects.ts before demo day — the TODO is already there waiting',
          },
        },
      ],
      backend: 'mock',
    };
  }

  async ping(): Promise<{ ok: boolean; backend: string; details?: string }> {
    return { ok: true, backend: 'mock', details: 'local fixture-backed mock' };
  }
}

/* ------------------------------------------------------------------ */
/* factory                                                             */
/* ------------------------------------------------------------------ */

/**
 * Picks the real client when TENSORLAKE_API_KEY is set, mock otherwise.
 * Set `TENSORLAKE_FORCE_MOCK=1` in the env to force mock even when a key
 * is present (useful for offline rehearsals).
 */
export function createTensorlakeClient(): TensorlakeClient {
  const key = process.env.TENSORLAKE_API_KEY?.trim();
  const forceMock = process.env.TENSORLAKE_FORCE_MOCK === '1';
  if (key && !forceMock) {
    console.info('[tensorlake] using real client (api.tensorlake.ai)');
    return new TensorlakeRealClient(key);
  }
  console.info('[tensorlake] using mock client (no TENSORLAKE_API_KEY or forced mock)');
  return new TensorlakeMockClient();
}

/** True when a real api key is configured (used by IPC `tensorlake:status`). */
export function isTensorlakeConfigured(): boolean {
  return !!process.env.TENSORLAKE_API_KEY?.trim() && process.env.TENSORLAKE_FORCE_MOCK !== '1';
}
