/**
 * timeline.ts — event normalizers for /admin/timeline.
 *
 * pulls raw rows from each convex table and squashes them into a single
 * `TimelineEvent` shape, so the unified feed can sort + render uniformly.
 *
 * normalizers are intentionally forgiving (any input shape, never throws)
 * because the demo timeline must keep flowing even if a single row is
 * malformed mid-stream.
 */
'use client';

export type Surface =
  | 'swipe'
  | 'electron'
  | 'sms'
  | 'discord'
  | 'nia'
  | 'tensorlake'
  | 'cron'
  | 'web'
  | 'bg';

export type Direction = 'inbound' | 'outbound' | 'internal';

export interface TimelineEvent {
  id: string;
  timestamp: number;
  surface: Surface;
  direction?: Direction;
  user?: string;
  /** 1-line summary, ~80 chars max */
  preview: string;
  /** raw event for the expanded row */
  full?: unknown;
}

const SURFACE_PRIORITY: Record<Surface, number> = {
  electron: 0,
  sms: 1,
  discord: 2,
  swipe: 3,
  nia: 4,
  bg: 5,
  tensorlake: 6,
  web: 7,
  cron: 8,
};

/* ───────────────────────────────────────────────── */
/* utils                                              */
/* ───────────────────────────────────────────────── */

function clip(s: unknown, max = 110): string {
  const str = typeof s === 'string' ? s : s == null ? '' : JSON.stringify(s);
  const trimmed = str.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max - 1) + '…';
}

function tsOf(row: Record<string, unknown>, fallback?: number): number {
  const t = row.timestamp ?? row.updatedAt ?? row._creationTime ?? fallback;
  return typeof t === 'number' && Number.isFinite(t) ? t : Date.now();
}

function idOf(row: Record<string, unknown>, prefix: string): string {
  const id = (row._id ?? row.id) as unknown;
  if (typeof id === 'string' && id.length > 0) return `${prefix}:${id}`;
  return `${prefix}:${tsOf(row)}:${Math.random().toString(36).slice(2, 8)}`;
}

/* ───────────────────────────────────────────────── */
/* normalizers — one per source table                 */
/* ───────────────────────────────────────────────── */

export function normalizeSwipe(row: Record<string, unknown>): TimelineEvent {
  const decision = String(row.decision ?? '');
  const cardId = String(row.cardId ?? '');
  const round = Number(row.round ?? 0);
  return {
    id: idOf(row, 'swipe'),
    timestamp: tsOf(row),
    surface: 'swipe',
    direction: 'inbound',
    user: String(row.userId ?? ''),
    preview: `r${round} · ${decision === 'yes' ? '👍' : '👎'} ${cardId}`,
    full: row,
  };
}

export function normalizeOrchestratorTurn(
  row: Record<string, unknown>,
): TimelineEvent {
  const userInput = String(row.userInput ?? '');
  const output = String(row.output ?? '');
  const tools = Array.isArray(row.toolsCalled) ? row.toolsCalled : [];
  const preview = output
    ? `← ${clip(output, 90)}`
    : userInput
      ? `→ ${clip(userInput, 90)}`
      : `(${tools.length} tool calls)`;
  return {
    id: idOf(row, 'orch'),
    timestamp: tsOf(row),
    surface: 'electron',
    direction: 'internal',
    user: String(row.userId ?? ''),
    preview,
    full: row,
  };
}

export function normalizeSmsTurn(row: Record<string, unknown>): TimelineEvent {
  const direction = (row.direction === 'outbound' ? 'outbound' : 'inbound') as Direction;
  const arrow = direction === 'inbound' ? '→' : '←';
  return {
    id: idOf(row, 'sms'),
    timestamp: tsOf(row),
    surface: 'sms',
    direction,
    user: String(row.userId ?? row.phoneNumber ?? ''),
    preview: `${arrow} ${clip(row.body, 100)}`,
    full: row,
  };
}

export function normalizeDiscordTurn(
  row: Record<string, unknown>,
): TimelineEvent {
  const direction = (row.direction === 'outbound' ? 'outbound' : 'inbound') as Direction;
  const arrow = direction === 'inbound' ? '→' : '←';
  return {
    id: idOf(row, 'dc'),
    timestamp: tsOf(row),
    surface: 'discord',
    direction,
    user: String(row.userId ?? row.discordUserId ?? ''),
    preview: `${arrow} ${clip(row.body, 100)}`,
    full: row,
  };
}

export function normalizeMemoryMirror(
  row: Record<string, unknown>,
): TimelineEvent {
  const type = String(row.type ?? 'memory');
  return {
    id: idOf(row, 'mem'),
    timestamp: tsOf(row),
    surface: 'nia',
    direction: 'internal',
    user: String(row.userId ?? ''),
    preview: `${type} · ${clip(row.content, 90)}`,
    full: row,
  };
}

export function normalizeBgObservation(
  row: Record<string, unknown>,
): TimelineEvent {
  const kind = String(row.kind ?? 'bg');
  const surface: Surface = kind === 'tensorlake' ? 'tensorlake' : 'bg';
  return {
    id: idOf(row, 'bg'),
    timestamp: tsOf(row),
    surface,
    direction: 'internal',
    user: String(row.userId ?? ''),
    preview: `${kind} · ${clip(row.summary, 90)}`,
    full: row,
  };
}

export function normalizeHeartbeat(
  row: Record<string, unknown>,
): TimelineEvent {
  const counter = Number(row.counter ?? 0);
  const source = String(row.source ?? 'cron');
  return {
    id: idOf(row, 'hb'),
    timestamp: tsOf(row),
    surface: 'cron',
    direction: 'internal',
    preview: `heartbeat #${counter} · ${source}`,
    full: row,
  };
}

/* ───────────────────────────────────────────────── */
/* badge tokens — color + label per surface            */
/* ───────────────────────────────────────────────── */

export const SURFACE_META: Record<
  Surface,
  { label: string; bg: string; fg: string; ring: string }
> = {
  swipe: {
    label: 'SWIPE',
    bg: 'bg-fuchsia-100',
    fg: 'text-fuchsia-800',
    ring: 'ring-fuchsia-300',
  },
  electron: {
    label: 'ELECTRON',
    bg: 'bg-emerald-100',
    fg: 'text-emerald-800',
    ring: 'ring-emerald-300',
  },
  sms: {
    label: 'SMS',
    bg: 'bg-pink-100',
    fg: 'text-pink-800',
    ring: 'ring-pink-300',
  },
  discord: {
    label: 'DISCORD',
    bg: 'bg-indigo-100',
    fg: 'text-indigo-800',
    ring: 'ring-indigo-300',
  },
  nia: {
    label: 'NIA',
    bg: 'bg-amber-100',
    fg: 'text-amber-800',
    ring: 'ring-amber-300',
  },
  tensorlake: {
    label: 'TENSORLAKE',
    bg: 'bg-violet-100',
    fg: 'text-violet-800',
    ring: 'ring-violet-300',
  },
  cron: {
    label: 'CRON',
    bg: 'bg-zinc-100',
    fg: 'text-zinc-700',
    ring: 'ring-zinc-300',
  },
  web: {
    label: 'WEB',
    bg: 'bg-purple-100',
    fg: 'text-purple-800',
    ring: 'ring-purple-300',
  },
  bg: {
    label: 'BG',
    bg: 'bg-stone-100',
    fg: 'text-stone-700',
    ring: 'ring-stone-300',
  },
};

export const ALL_SURFACES: Surface[] = (Object.keys(SURFACE_META) as Surface[]).sort(
  (a, b) => SURFACE_PRIORITY[a] - SURFACE_PRIORITY[b],
);

/* ───────────────────────────────────────────────── */
/* time formatter                                     */
/* ───────────────────────────────────────────────── */

export function relativeTime(ms: number, now: number = Date.now()): string {
  const diff = Math.max(0, now - ms);
  const s = Math.floor(diff / 1000);
  if (s < 1) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function absoluteTime(ms: number): string {
  try {
    return new Date(ms).toLocaleString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return new Date(ms).toISOString();
  }
}

/* ───────────────────────────────────────────────── */
/* merger — interleave + sort                         */
/* ───────────────────────────────────────────────── */

export function mergeAndSort(
  ...streams: ReadonlyArray<readonly TimelineEvent[]>
): TimelineEvent[] {
  const all: TimelineEvent[] = [];
  for (const s of streams) for (const e of s) all.push(e);
  all.sort((a, b) => b.timestamp - a.timestamp);
  // dedupe by id (defensive — convex never gives dupes within a query)
  const seen = new Set<string>();
  const out: TimelineEvent[] = [];
  for (const e of all) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    out.push(e);
  }
  return out;
}
