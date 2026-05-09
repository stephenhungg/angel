/**
 * Demo seed — writes the 8 entries from docs/MEMORY.md to memory so first
 * launch has retrieval results. The "...how'd that portfolio thing land?"
 * callback hits these.
 *
 * Idempotent: we check against a sentinel file (~/.angel/seed.lock) AND
 * by querying memory for a known content fragment. If either says "done",
 * skip. The lock is the fast path; the query is the safety net (e.g.,
 * fresh machine where Nia already has the entries from a prior demo).
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { AngelMemory, MemoryEntry } from '@angel/shared';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The 8 demo entries — mirrors docs/MEMORY.md exactly. */
function buildSeedEntries(userId: string, now: number): Array<Omit<MemoryEntry, 'id'>> {
  return [
    {
      userId,
      type: 'episodic',
      content:
        "stephen showed me his portfolio site three weeks ago — wanted to add more projects but kept procrastinating",
      timestamp: now - 21 * DAY_MS,
      metadata: { source: 'seed' },
    },
    {
      userId,
      type: 'episodic',
      content: 'deployed his hackathon project last weekend, landed clean on first try',
      timestamp: now - 5 * DAY_MS,
      metadata: { source: 'seed' },
    },
    {
      userId,
      type: 'preference',
      content: 'stephen prefers minimal + warm portfolios, dislikes cyberpunk aesthetic',
      timestamp: now - 14 * DAY_MS,
      metadata: { source: 'seed' },
    },
    {
      userId,
      type: 'preference',
      content: 'stephen likes when i narrate while working, not after',
      timestamp: now - 10 * DAY_MS,
      metadata: { source: 'seed' },
    },
    {
      userId,
      type: 'semantic',
      content: "stephen's portfolio repo: github.com/stephenhung/portfolio",
      timestamp: now - 14 * DAY_MS,
      metadata: { source: 'seed' },
    },
    {
      userId,
      type: 'semantic',
      content: 'stephen uses vercel for deploys',
      timestamp: now - 14 * DAY_MS,
      metadata: { source: 'seed' },
    },
    {
      userId,
      type: 'episodic',
      content: 'last pairing session, stephen asked me to be more concise',
      timestamp: now - 3 * DAY_MS,
      metadata: { source: 'seed' },
    },
    {
      userId,
      type: 'episodic',
      content: 'stephen mentioned wanting a project card for me on his site',
      timestamp: now - 7 * DAY_MS,
      metadata: { source: 'seed' },
    },
  ];
}

function lockPath(userId: string): string {
  const dir = path.join(os.homedir(), '.angel');
  return path.join(dir, `seed.${slug(userId)}.lock`);
}

function slug(s: string): string {
  return s.replace(/[^a-z0-9_-]/gi, '_').slice(0, 64) || 'default';
}

/** Read the sentinel — true iff seed previously completed for this user. */
function lockExists(userId: string): boolean {
  try {
    return fs.existsSync(lockPath(userId));
  } catch {
    return false;
  }
}

function writeLock(userId: string): void {
  try {
    const lp = lockPath(userId);
    fs.mkdirSync(path.dirname(lp), { recursive: true });
    fs.writeFileSync(lp, JSON.stringify({ at: new Date().toISOString(), userId }), 'utf8');
  } catch (err) {
    console.warn('[memory.seed] failed to write lock:', err);
  }
}

/**
 * Seed the demo history. Idempotent — safe to call on every boot.
 * Returns true iff entries were just written, false iff already seeded.
 */
export async function seedDemoHistory(memory: AngelMemory, userId: string): Promise<boolean> {
  if (lockExists(userId)) {
    return false;
  }
  // Safety net: if Nia already has our seed entries (prior demo), skip + lock.
  try {
    const probe = await memory.relevantSemantic('portfolio site three weeks ago', 3);
    const alreadySeeded = probe.some(
      (m) =>
        m.userId === userId &&
        (m.metadata?.source === 'seed' || m.content.startsWith('stephen showed me his portfolio')),
    );
    if (alreadySeeded) {
      writeLock(userId);
      return false;
    }
  } catch (err) {
    // probe failure is non-fatal — proceed to write
    console.warn('[memory.seed] probe failed, will write anyway:', err);
  }

  const now = Date.now();
  const entries = buildSeedEntries(userId, now);
  let written = 0;
  for (const e of entries) {
    try {
      await memory.remember(e);
      written += 1;
    } catch (err) {
      console.error('[memory.seed] failed to write entry:', err);
    }
  }
  console.info(`[memory.seed] wrote ${written}/${entries.length} demo entries for user ${userId}`);
  if (written > 0) writeLock(userId);
  return written > 0;
}
