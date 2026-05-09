/**
 * Memory factory + status surface.
 *
 * `buildMemory()` picks Nia (production) when NIA_API_KEY is set, otherwise
 * falls back to LocalMemory. The orchestrator only sees the AngelMemory
 * interface, so the rest of the app doesn't care which backend is live.
 *
 * `memoryStatus()` powers the brain:status IPC + admin UI.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AngelMemory, MemoryContext } from '@angel/shared';
import { LocalMemory } from './local';
import { NiaMemory } from './nia';

export type MemoryBackend = 'nia' | 'local';

let _memory: AngelMemory | null = null;
let _backend: MemoryBackend = 'local';
let _seedComplete = false;
let _userId = 'default';

/** The default user id we tag entries with. Single-user app for hackathon. */
export const DEFAULT_USER_ID = 'stephen';

/**
 * Construct the memory client for the current process. Idempotent — returns
 * the same instance on subsequent calls. Reads NIA_API_KEY from env.
 */
export function buildMemory(userId: string = DEFAULT_USER_ID): AngelMemory {
  if (_memory) return _memory;
  _userId = userId;
  const key = process.env.NIA_API_KEY?.trim();
  if (key) {
    _memory = new NiaMemory(key, userId);
    _backend = 'nia';
    console.info('[memory] backend=nia user=%s', userId);
  } else {
    _memory = new LocalMemory();
    _backend = 'local';
    console.info('[memory] backend=local (NIA_API_KEY missing) user=%s', userId);
  }
  return _memory;
}

/** Returns the singleton memory, building it lazily if needed. */
export function getMemory(): AngelMemory {
  if (!_memory) return buildMemory();
  return _memory;
}

export function getMemoryBackend(): MemoryBackend {
  return _backend;
}

export function setSeedComplete(done: boolean): void {
  _seedComplete = done;
}

export function isSeedComplete(): boolean {
  return _seedComplete;
}

/** Read ~/.angel/reflective_summary.md if present, else undefined. */
export function readReflectiveSummary(): string | undefined {
  try {
    const p = path.join(os.homedir(), '.angel', 'reflective_summary.md');
    if (!fs.existsSync(p)) return undefined;
    const text = fs.readFileSync(p, 'utf8');
    return text.trim() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Build the per-turn MemoryContext for the orchestrator. Pulls recent
 * episodic + semantically relevant + reflective summary in parallel.
 * On any sub-failure, returns a partial context — never throws.
 */
export async function buildMemoryContext(
  userMessage: string,
  opts: { recentN?: number; relevantN?: number } = {},
): Promise<MemoryContext> {
  const memory = getMemory();
  const recentN = opts.recentN ?? 5;
  const relevantN = opts.relevantN ?? 3;
  const [recent, relevant] = await Promise.all([
    memory.recentEpisodic(recentN).catch((err) => {
      console.warn('[memory] recentEpisodic failed:', err);
      return [];
    }),
    userMessage.trim()
      ? memory
          .relevantSemantic(userMessage, relevantN)
          .catch((err) => {
            console.warn('[memory] relevantSemantic failed:', err);
            return [];
          })
      : Promise.resolve([]),
  ]);
  return {
    recent,
    relevant,
    reflectiveSummary: readReflectiveSummary(),
  };
}

export interface MemoryStatus {
  backend: MemoryBackend;
  seedComplete: boolean;
  entryCount: number;
  ok: boolean;
  details?: string;
}

export async function memoryStatus(): Promise<MemoryStatus> {
  const memory = getMemory();
  const ping = await memory.ping().catch((err) => ({
    ok: false,
    backend: _backend,
    details: String((err as Error)?.message ?? err),
  }));
  let entryCount = 0;
  if (memory instanceof LocalMemory) {
    entryCount = memory.count();
  } else {
    // Nia exposes total via list endpoint — but we keep this cheap; the ping
    // already runs a list w/ limit=1 and surfaces "total=N" in details.
    const m = ping.details?.match(/total=(\d+)/);
    if (m) entryCount = Number(m[1]);
  }
  return {
    backend: _backend,
    seedComplete: _seedComplete,
    entryCount,
    ok: ping.ok,
    details: ping.details,
  };
}

export { LocalMemory, NiaMemory };
