/**
 * LocalMemory — in-process AngelMemory fallback.
 *
 * Used when NIA_API_KEY is not set, when Nia is unreachable, or in CI.
 * Keeps everything in a single in-memory array. "Semantic search" is a
 * naive keyword-overlap score over content + tags. Good enough for the
 * demo callback ("portfolio" finds the seeded portfolio entries).
 *
 * IMPORTANT: behavior must mirror NiaMemory closely so the orchestrator
 * doesn't notice which backend is active. Same MemoryEntry shape, same
 * sort orders, same filter semantics.
 */
import { randomUUID } from 'node:crypto';
import type { AngelMemory, MemoryEntry, RecallQuery } from '@angel/shared';

export class LocalMemory implements AngelMemory {
  private store: MemoryEntry[] = [];

  async remember(entry: Omit<MemoryEntry, 'id'>): Promise<MemoryEntry> {
    const populated: MemoryEntry = {
      ...entry,
      id: randomUUID(),
      embedding: undefined,
    };
    this.store.push(populated);
    return populated;
  }

  async recall(q: RecallQuery): Promise<MemoryEntry[]> {
    let rows = this.store.slice();
    if (q.type) rows = rows.filter((r) => r.type === q.type);
    if (typeof q.since === 'number') rows = rows.filter((r) => r.timestamp >= q.since!);
    if (q.query && q.query.trim()) {
      const scored = rows.map((r) => ({ r, s: scoreOverlap(q.query!, r.content) }));
      scored.sort((a, b) => b.s - a.s);
      rows = scored.filter((x) => x.s > 0).map((x) => x.r);
    } else {
      rows.sort((a, b) => b.timestamp - a.timestamp);
    }
    return rows.slice(0, q.limit ?? 50);
  }

  async recentEpisodic(n: number): Promise<MemoryEntry[]> {
    return this.store
      .filter((r) => r.type === 'episodic')
      .slice()
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, n);
  }

  async relevantSemantic(query: string, n: number): Promise<MemoryEntry[]> {
    const scored = this.store.map((r) => ({ r, s: scoreOverlap(query, r.content) }));
    scored.sort((a, b) => b.s - a.s);
    return scored.filter((x) => x.s > 0).slice(0, n).map((x) => x.r);
  }

  async ping(): Promise<{ ok: boolean; backend: string; details?: string }> {
    return { ok: true, backend: 'local', details: `${this.store.length} entries` };
  }

  /** Internal — used by status IPC. */
  count(): number {
    return this.store.length;
  }
}

/** naive token-overlap score: shared lowercase tokens, length-normalized. */
function scoreOverlap(q: string, content: string): number {
  const stop = new Set([
    'the', 'a', 'an', 'is', 'was', 'be', 'to', 'of', 'and', 'or', 'in', 'on', 'at',
    'for', 'with', 'that', 'this', 'it', 'i', 'me', 'my', 'you', 'your', 'his', 'her',
    'about', 'how', 'what', 'when', 'where', 'why', 'last', 'thing',
  ]);
  const tok = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 1 && !stop.has(w));
  const qt = new Set(tok(q));
  if (qt.size === 0) return 0;
  const ct = tok(content);
  let hits = 0;
  for (const w of ct) if (qt.has(w)) hits += 1;
  return hits;
}
