#!/usr/bin/env node
/**
 * Curated gbrain → nia bulk ingester.
 *
 * Walks ~/Documents/GitHub/stephen-brain, picks high-signal directories
 * (people, projects, concepts, insights, arcs, groups, recent scenes, wiki),
 * uploads each .md as a Nia context entry.
 *
 * Run: NIA_API_KEY=... node convex/scripts/ingest-gbrain.mjs
 * Optional: BRAIN_DIR=... LIMIT=500 DRY_RUN=1
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const NIA_API_KEY = process.env.NIA_API_KEY;
if (!NIA_API_KEY) {
  console.error('NIA_API_KEY not set');
  process.exit(1);
}

const BRAIN_DIR = process.env.BRAIN_DIR || path.join(os.homedir(), 'Documents/GitHub/stephen-brain');
const LIMIT = parseInt(process.env.LIMIT || '0', 10) || Infinity;
const DRY_RUN = process.env.DRY_RUN === '1';
const RATE_MS = parseInt(process.env.RATE_MS || '250', 10); // ~4 req/sec

// curated set — ranked by callback value for the demo
const CURATED_DIRS = [
  { dir: 'people', memory_type: 'fact', max: 250 },
  { dir: 'projects', memory_type: 'fact', max: 50 },
  { dir: 'concepts', memory_type: 'fact', max: 200 },
  { dir: 'insights', memory_type: 'fact', max: 200 },
  { dir: 'arcs', memory_type: 'fact', max: 20 },
  { dir: 'groups', memory_type: 'fact', max: 300 },
  { dir: 'wiki', memory_type: 'fact', max: 100 },
  { dir: 'life-wiki', memory_type: 'fact', max: 100 },
  // recent scenes (last 30d) — matched by filename starting with 2026-04 or 2026-05
  { dir: 'scenes', memory_type: 'episodic', max: 200, filter: (f) => /^2026-(04|05)/.test(f) },
  { dir: 'originals', memory_type: 'fact', max: 30 },
];

async function findFiles(dir, filter) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    let files = entries
      .filter((e) => e.isFile() && e.name.endsWith('.md'))
      .map((e) => e.name);
    if (filter) files = files.filter(filter);
    return files.sort();
  } catch (e) {
    return [];
  }
}

function deriveTitle(filename, content) {
  // try first H1; fall back to slug
  const h1 = content.match(/^# (.+)$/m);
  if (h1) return h1[1].slice(0, 200);
  return filename.replace(/\.md$/, '').replace(/-/g, ' ').slice(0, 200);
}

function deriveSummary(content) {
  // strip frontmatter, take first paragraph
  let body = content.replace(/^---\n[\s\S]*?\n---\n/, '');
  body = body.replace(/^#+ .+$/gm, '').trim(); // drop headings
  const para = body.split(/\n\n/).find((p) => p.trim().length > 20);
  return (para || body).slice(0, 400).replace(/\s+/g, ' ').trim();
}

async function uploadOne({ filepath, slug, dirName, memory_type }) {
  const raw = await fs.readFile(filepath, 'utf8');
  if (raw.length < 50) return { skipped: 'too short' };

  const title = deriveTitle(slug, raw);
  const summary = deriveSummary(raw);
  // nia min content length is ~50 chars; pad if needed (rare)
  const content = raw.length >= 50 ? raw : (raw + '\n\n[short page]');

  const body = {
    title: title.slice(0, 200),
    summary: summary || title,
    content: content.slice(0, 50000), // cap absurd sizes
    memory_type,
    agent_source: 'gbrain-import',
    tags: ['gbrain', dirName, slug.replace(/\.md$/, '')],
    metadata: {
      source: 'gbrain',
      slug: slug.replace(/\.md$/, ''),
      page_type: dirName,
    },
  };

  if (DRY_RUN) {
    return { id: 'dry-run', title: body.title };
  }

  const res = await fetch('https://apigcp.trynia.ai/v2/contexts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${NIA_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    return { error: `${res.status} ${t.slice(0, 200)}` };
  }
  return await res.json();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`[gbrain→nia] start. dry=${DRY_RUN} brain=${BRAIN_DIR}`);
  let total = 0, ok = 0, skipped = 0, errors = 0;
  for (const cfg of CURATED_DIRS) {
    if (total >= LIMIT) break;
    const dirPath = path.join(BRAIN_DIR, cfg.dir);
    const files = await findFiles(dirPath, cfg.filter);
    if (files.length === 0) {
      console.log(`[${cfg.dir}] (none)`);
      continue;
    }
    const take = files.slice(0, cfg.max);
    console.log(`[${cfg.dir}] ${take.length}/${files.length} files`);
    for (const slug of take) {
      if (total >= LIMIT) break;
      total++;
      const filepath = path.join(dirPath, slug);
      const r = await uploadOne({ filepath, slug, dirName: cfg.dir, memory_type: cfg.memory_type });
      if (r.error) { errors++; console.log(`  ✗ ${slug} → ${r.error}`); }
      else if (r.skipped) { skipped++; }
      else { ok++; if (ok % 20 === 0) console.log(`  ✓ ${ok} uploaded so far...`); }
      await sleep(RATE_MS);
    }
  }
  console.log(`\n[gbrain→nia] done. total=${total} ok=${ok} skipped=${skipped} errors=${errors}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
