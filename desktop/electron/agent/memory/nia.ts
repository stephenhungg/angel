/**
 * NiaMemory — AngelMemory backed by the Nia Context Sharing API.
 *
 * Docs: https://docs.trynia.ai (Context Sharing endpoints)
 * Base URL: https://apigcp.trynia.ai/v2
 * Auth:    Authorization: Bearer ${NIA_API_KEY}
 *
 * Mapping (AngelMemory → Nia):
 *   MemoryEntry.content      → Nia context.content (>=50 chars; we pad if shorter)
 *   MemoryEntry.type         → Nia memory_type (episodic, fact, procedural, scratchpad)
 *                              we map: episodic→episodic, semantic→fact,
 *                              preference→fact (tagged "preference"),
 *                              observation→scratchpad
 *   MemoryEntry.userId       → tag "user:<userId>"
 *   MemoryEntry.timestamp    → metadata.timestamp (also encoded into agent_source)
 *   MemoryEntry.metadata     → metadata.* (passed through verbatim)
 *
 * Endpoints we use:
 *   POST /contexts                         — write
 *   GET  /contexts/semantic-search?q=...   — semantic recall
 *   GET  /contexts?memory_type=episodic    — recent episodic
 *
 * Falls back to throwing on network/auth failure; the factory in index.ts
 * wraps us with a LocalMemory so the demo never hard-breaks.
 */
import type { AngelMemory, MemoryEntry, MemoryType, RecallQuery } from '@angel/shared';

const NIA_BASE_URL = process.env.NIA_BASE_URL?.trim() || 'https://apigcp.trynia.ai/v2';
const AGENT_SOURCE = 'angel-orchestrator';

interface NiaContextRow {
  id: string;
  user_id?: string;
  title: string;
  summary: string;
  content: string;
  tags?: string[];
  agent_source?: string;
  created_at?: string;
  memory_type?: 'scratchpad' | 'episodic' | 'fact' | 'procedural';
  metadata?: Record<string, unknown>;
}

interface ListContextsResponse {
  items?: NiaContextRow[];
  contexts?: NiaContextRow[];
  pagination?: { total: number; limit: number; offset: number; has_more: boolean };
  total?: number;
}

interface SemanticSearchResponse {
  results?: NiaContextRow[];
  search_query?: string;
}

export class NiaMemory implements AngelMemory {
  constructor(
    private readonly apiKey: string,
    private readonly userId: string,
    private readonly baseUrl: string = NIA_BASE_URL,
  ) {}

  /* -------------------- write -------------------- */

  async remember(entry: Omit<MemoryEntry, 'id'>): Promise<MemoryEntry> {
    const body = entryToNiaPayload(entry, this.userId);
    const row = await this.fetchJson<NiaContextRow>('POST', '/contexts', body);
    return niaRowToEntry(row, this.userId, entry);
  }

  /* -------------------- read -------------------- */

  async recall(q: RecallQuery): Promise<MemoryEntry[]> {
    if (q.query && q.query.trim()) {
      // semantic path
      const all = await this.semanticSearch(q.query, q.limit ?? 20);
      let rows = all;
      if (q.type) rows = rows.filter((r) => r.type === q.type);
      if (typeof q.since === 'number') rows = rows.filter((r) => r.timestamp >= q.since!);
      return rows.slice(0, q.limit ?? 20);
    }
    // listing path
    const params = new URLSearchParams();
    params.set('limit', String(q.limit ?? 20));
    if (q.type) params.set('memory_type', mapTypeToNia(q.type));
    const resp = await this.fetchJson<ListContextsResponse>('GET', `/contexts?${params.toString()}`);
    const rows = (resp.items ?? resp.contexts ?? []).map((r) => niaRowToEntry(r, this.userId));
    let filtered = rows.filter((r) => r.userId === this.userId);
    if (q.type) filtered = filtered.filter((r) => r.type === q.type);
    if (typeof q.since === 'number') filtered = filtered.filter((r) => r.timestamp >= q.since!);
    filtered.sort((a, b) => b.timestamp - a.timestamp);
    return filtered.slice(0, q.limit ?? 20);
  }

  async recentEpisodic(n: number): Promise<MemoryEntry[]> {
    return this.recall({ type: 'episodic', limit: n });
  }

  async relevantSemantic(query: string, n: number): Promise<MemoryEntry[]> {
    return this.semanticSearch(query, n);
  }

  async ping(): Promise<{ ok: boolean; backend: string; details?: string }> {
    try {
      const resp = await this.fetchJson<ListContextsResponse>('GET', '/contexts?limit=1');
      const total = resp.pagination?.total ?? resp.total ?? 0;
      return { ok: true, backend: 'nia', details: `total=${total}` };
    } catch (err) {
      return { ok: false, backend: 'nia', details: String((err as Error)?.message ?? err) };
    }
  }

  /* -------------------- internals -------------------- */

  private async semanticSearch(query: string, limit: number): Promise<MemoryEntry[]> {
    const params = new URLSearchParams();
    params.set('q', query);
    params.set('limit', String(Math.max(1, Math.min(100, limit))));
    params.set('include_highlights', 'false');
    const resp = await this.fetchJson<SemanticSearchResponse>(
      'GET',
      `/contexts/semantic-search?${params.toString()}`,
    );
    const rows = resp.results ?? [];
    return rows
      .map((r) => niaRowToEntry(r, this.userId))
      .filter((r) => r.userId === this.userId);
  }

  private async fetchJson<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const resp = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`Nia ${method} ${path} → ${resp.status}: ${text.slice(0, 240)}`);
    }
    return (await resp.json()) as T;
  }
}

/* -------------------- mapping helpers -------------------- */

function mapTypeToNia(t: MemoryType): 'episodic' | 'fact' | 'procedural' | 'scratchpad' {
  switch (t) {
    case 'episodic':
      return 'episodic';
    case 'semantic':
    case 'preference':
      return 'fact';
    case 'observation':
      return 'scratchpad';
  }
}

function mapTypeFromNia(
  niaType: NiaContextRow['memory_type'] | undefined,
  tags: string[],
): MemoryType {
  if (niaType === 'episodic') return 'episodic';
  if (niaType === 'scratchpad') return 'observation';
  if (niaType === 'fact') {
    return tags.includes('preference') ? 'preference' : 'semantic';
  }
  // procedural is rare for v1; map to semantic
  return 'semantic';
}

function entryToNiaPayload(
  entry: Omit<MemoryEntry, 'id'>,
  userId: string,
): Record<string, unknown> {
  // Nia requires content >= 50 chars; pad short content with whitespace + ts marker.
  const content =
    entry.content.length >= 50
      ? entry.content
      : `${entry.content}  [angel:${entry.type}@${entry.timestamp}]`;
  // title: short slug from first 80 chars
  const title = entry.content.slice(0, 80) || `${entry.type} memory`;
  // summary: must be >=10 chars
  const summary =
    entry.content.length >= 10
      ? entry.content.slice(0, 240)
      : `angel ${entry.type} memory: ${entry.content}`;
  const tags: string[] = [
    `user:${userId}`,
    `angel:${entry.type}`,
    `source:${entry.metadata?.source ?? 'turn'}`,
  ];
  if (entry.type === 'preference') tags.push('preference');
  return {
    title,
    summary,
    content,
    agent_source: AGENT_SOURCE,
    tags,
    memory_type: mapTypeToNia(entry.type),
    metadata: {
      ...(entry.metadata ?? {}),
      angel_user_id: userId,
      angel_type: entry.type,
      timestamp: entry.timestamp,
    },
  };
}

function niaRowToEntry(
  row: NiaContextRow,
  fallbackUserId: string,
  fallback?: Omit<MemoryEntry, 'id'>,
): MemoryEntry {
  const md = row.metadata ?? {};
  const tags = row.tags ?? [];
  const type = mapTypeFromNia(row.memory_type, tags);
  const userTag = tags.find((t) => t.startsWith('user:'));
  const userId =
    (typeof md.angel_user_id === 'string' && md.angel_user_id) ||
    (userTag ? userTag.slice(5) : fallbackUserId);
  const ts =
    (typeof md.timestamp === 'number' && md.timestamp) ||
    (row.created_at ? Date.parse(row.created_at) : undefined) ||
    fallback?.timestamp ||
    Date.now();
  const sourceTag = tags.find((t) => t.startsWith('source:'));
  const source = sourceTag?.slice(7) as MemoryEntry['metadata'] extends infer M
    ? M extends { source?: infer S } ? S : undefined
    : undefined;
  return {
    id: row.id,
    userId,
    type,
    content: stripPad(row.content ?? fallback?.content ?? ''),
    timestamp: ts,
    metadata: {
      ...(md as MemoryEntry['metadata']),
      ...(source ? { source } : {}),
    } as MemoryEntry['metadata'],
  };
}

/** Reverse the [angel:type@ts] padding suffix we add to short entries. */
function stripPad(s: string): string {
  return s.replace(/\s*\[angel:[^\]]+\]\s*$/, '').trim();
}
