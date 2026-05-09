/**
 * AngelMemory — the memory contract.
 * v1: backed by Nia API (sponsor). v2 sockets: tensorlake-fed semantic + reflective compaction.
 *
 * Both web and desktop import this. Implementations live in:
 *   - desktop/electron/agent/memory/nia.ts (production)
 *   - desktop/electron/agent/memory/seed.ts (demo seed entries)
 */

export type MemoryType = 'episodic' | 'semantic' | 'preference' | 'observation';

export interface MemoryEntry {
  id: string;
  userId: string;
  type: MemoryType;
  content: string;
  timestamp: number;
  embedding?: number[]; // populated by nia
  metadata?: {
    sourceTurnId?: string;
    relatedTaskId?: string;
    confidence?: number;
    source?: 'turn' | 'seed' | 'tensorlake' | 'observation';
  };
}

export interface RecallQuery {
  type?: MemoryType;
  query?: string;       // free-text semantic search
  since?: number;       // unix ms
  limit?: number;
}

/**
 * The memory adapter interface. Same interface for nia / file / mock.
 * Used by orchestrator each turn to retrieve context, write events, recall history.
 */
export interface AngelMemory {
  /** Write a memory entry. Returns the populated entry (with id + embedding). */
  remember(entry: Omit<MemoryEntry, 'id'>): Promise<MemoryEntry>;

  /** Free-form recall — combines type/query/since filters. */
  recall(q: RecallQuery): Promise<MemoryEntry[]>;

  /** Recent N episodic events by timestamp desc. */
  recentEpisodic(n: number): Promise<MemoryEntry[]>;

  /** Top-K semantically relevant entries to a free-text query. */
  relevantSemantic(query: string, n: number): Promise<MemoryEntry[]>;

  /** Health check — does the backend respond. */
  ping(): Promise<{ ok: boolean; backend: string; details?: string }>;
}

/**
 * Memory injection block — what gets prepended to the orchestrator system prompt.
 * Built per turn from a fresh recall against the user's latest message.
 */
export interface MemoryContext {
  recent: MemoryEntry[];        // last 5 episodic
  relevant: MemoryEntry[];       // top 3 semantic for current message
  reflectiveSummary?: string;    // ~/.angel/reflective_summary.md, if present
}

/**
 * Render a MemoryContext as the prompt-injection string we splice into
 * orchestrator system prompts. Single source of truth for prompt formatting.
 */
export function renderMemoryBlock(ctx: MemoryContext): string {
  const lines: string[] = [];
  lines.push('# memory');
  lines.push('# things you remember about this person and your shared history.');
  lines.push('# treat these as facts you already know; do NOT cite them as quoted memory.');
  lines.push('# weave naturally into reactions, callbacks, references.');

  if (ctx.reflectiveSummary && ctx.reflectiveSummary.trim()) {
    lines.push('');
    lines.push('## relationship state (your accumulated sense of them)');
    lines.push(ctx.reflectiveSummary.trim());
  }

  if (ctx.relevant.length > 0) {
    lines.push('');
    lines.push('## relevant to what they just said');
    for (const m of ctx.relevant) {
      lines.push(`- [${m.type}] ${m.content}`);
    }
  }

  if (ctx.recent.length > 0) {
    lines.push('');
    lines.push('## recent events (most recent first)');
    for (const m of ctx.recent) {
      const age = ageString(Date.now() - m.timestamp);
      lines.push(`- [${age} ago] ${m.content}`);
    }
  }

  return lines.join('\n');
}

function ageString(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}
