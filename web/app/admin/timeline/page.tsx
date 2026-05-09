'use client';

/**
 * /admin/timeline — unified live feed across every angel surface.
 *
 * Subscribes to N convex queries, normalizes each row into a TimelineEvent,
 * interleaves them by timestamp desc, and renders the merged stream as a
 * single feed. New rows from any table animate in via AnimatePresence —
 * convex `useQuery` is reactive, so this auto-updates.
 *
 * The demo flex: judge texts SMS, judge texts discord, matthew talks to
 * electron — they all show up in the same scroll, side by side, with
 * matching memory writes from nia. Undeniable proof of cross-surface mind.
 */

import { useMemo, useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from 'convex/react';
import { api } from '@angel/convex/api';
import {
  normalizeSwipe,
  normalizeOrchestratorTurn,
  normalizeSmsTurn,
  normalizeDiscordTurn,
  normalizeMemoryMirror,
  normalizeBgObservation,
  normalizeHeartbeat,
  mergeAndSort,
  relativeTime,
  absoluteTime,
  SURFACE_META,
  ALL_SURFACES,
  type TimelineEvent,
  type Surface,
} from '@/lib/timeline';

const PER_TABLE_LIMIT = 200;

// ──────────────────────────────────────────────────────────────────────────
// reactive ticker — re-render every second so relative timestamps update.
// ──────────────────────────────────────────────────────────────────────────
function useNowTick(periodMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), periodMs);
    return () => window.clearInterval(id);
  }, [periodMs]);
  return now;
}

export default function TimelinePage() {
  const haveConvex =
    typeof process !== 'undefined' && !!process.env.NEXT_PUBLIC_CONVEX_URL;
  const skip = haveConvex ? undefined : ('skip' as const);

  // ── live queries — one per source table ──────────────────────────────
  // each is reactive: convex pushes new rows within ~1s of insert.
  const swipes =
    useQuery(api.observability.recentSwipes, skip ?? { limit: PER_TABLE_LIMIT }) ?? [];
  const orchestratorTurns =
    useQuery(api.observability.recentOrchestratorTurns, skip ?? { limit: PER_TABLE_LIMIT }) ?? [];
  const smsTurns =
    useQuery(api.sms.functions.allRecentSmsTurns, skip ?? { limit: PER_TABLE_LIMIT }) ?? [];
  const discordTurns =
    useQuery(api.discord.functions.allRecentDiscordTurns, skip ?? { limit: PER_TABLE_LIMIT }) ?? [];
  const memory =
    useQuery(api.memoryMirror.allRecent, skip ?? { limit: PER_TABLE_LIMIT }) ?? [];
  const bg =
    useQuery(api.memoryMirror.recentBgObservations, skip ?? { limit: PER_TABLE_LIMIT }) ?? [];
  const heartbeats =
    useQuery(api.agentState.recentHeartbeats, skip ?? { limit: 40 }) ?? [];

  // ── normalize + merge ────────────────────────────────────────────────
  const events: TimelineEvent[] = useMemo(() => {
    return mergeAndSort(
      (swipes as Array<Record<string, unknown>>).map(normalizeSwipe),
      (orchestratorTurns as Array<Record<string, unknown>>).map(normalizeOrchestratorTurn),
      (smsTurns as Array<Record<string, unknown>>).map(normalizeSmsTurn),
      (discordTurns as Array<Record<string, unknown>>).map(normalizeDiscordTurn),
      (memory as Array<Record<string, unknown>>).map(normalizeMemoryMirror),
      (bg as Array<Record<string, unknown>>).map(normalizeBgObservation),
      (heartbeats as Array<Record<string, unknown>>).map(normalizeHeartbeat),
    );
  }, [swipes, orchestratorTurns, smsTurns, discordTurns, memory, bg, heartbeats]);

  // ── per-surface counts (always full unfiltered) ──────────────────────
  const counts = useMemo(() => {
    const c: Partial<Record<Surface, number>> = {};
    for (const e of events) c[e.surface] = (c[e.surface] ?? 0) + 1;
    return c;
  }, [events]);

  // ── filter chips ─────────────────────────────────────────────────────
  const [enabled, setEnabled] = useState<Record<Surface, boolean>>(() => {
    const init = {} as Record<Surface, boolean>;
    for (const s of ALL_SURFACES) init[s] = true;
    return init;
  });

  const filtered = useMemo(
    () => events.filter((e) => enabled[e.surface]),
    [events, enabled],
  );

  // ── "new since you opened" counter ───────────────────────────────────
  const sessionStartRef = useRef<number>(Date.now());
  const newSinceOpened = useMemo(
    () => filtered.filter((e) => e.timestamp >= sessionStartRef.current).length,
    [filtered],
  );

  // ── expanded row ─────────────────────────────────────────────────────
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // ── relative-time tick ───────────────────────────────────────────────
  const now = useNowTick(1000);

  return (
    <div className="grid grid-cols-1 tablet:grid-cols-[200px_1fr_260px] min-h-[calc(100vh-72px)]">
      {/* left rail — surface filter chips */}
      <aside className="hairline border-r overflow-y-auto">
        <div className="gutter py-6 sticky top-0 bg-paper z-10 hairline border-b">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-secondary">
            filter
          </span>
          <h2 className="font-display italic text-[22px] text-ink-primary leading-none mt-1">
            surfaces
          </h2>
        </div>
        <div className="gutter py-4 flex flex-col gap-1.5">
          {ALL_SURFACES.map((s) => {
            const meta = SURFACE_META[s];
            const on = enabled[s];
            const count = counts[s] ?? 0;
            return (
              <button
                key={s}
                onClick={() => setEnabled((prev) => ({ ...prev, [s]: !prev[s] }))}
                className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-sm border transition-all text-left ${
                  on
                    ? `${meta.bg} ${meta.fg} border-transparent`
                    : 'bg-transparent text-muted-tertiary border-hairline hover:border-ink-near'
                }`}
              >
                <span className="font-mono text-[10px] uppercase tracking-[0.14em]">
                  {meta.label}
                </span>
                <span className={`font-mono text-[10px] tabular-nums ${on ? '' : 'text-muted-secondary'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      {/* main feed */}
      <main className="min-w-0 flex flex-col">
        {/* page header */}
        <div className="gutter pt-10 pb-4 hairline border-b">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-secondary">
            view 04 / unified surface feed
          </span>
          <h1 className="font-display italic text-[56px] leading-none text-ink-primary mt-1">
            timeline
          </h1>
          <p className="font-sans text-[14px] text-muted-deep mt-3 max-w-[680px] leading-relaxed">
            every word, tool call, and memory write across every surface — same
            timeline. electron, sms, discord, web, tensorlake, nia. interleaved
            chronologically. live.
          </p>

          <div className="mt-4 flex items-center gap-4 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-secondary">
            <span>
              <span className="text-ink-primary font-display italic normal-case tracking-normal">
                {filtered.length}
              </span>{' '}
              shown
            </span>
            <span className="text-hairline">·</span>
            <span>
              <span className="text-ink-primary font-display italic normal-case tracking-normal">
                {events.length}
              </span>{' '}
              total
            </span>
            <span className="text-hairline">·</span>
            <span>
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500/70 mr-1.5 align-middle animate-pulse" />
              live
            </span>
          </div>
        </div>

        {/* feed */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="gutter py-20 text-center">
              <p className="font-display italic text-[28px] text-muted-tertiary">
                waiting for events…
              </p>
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-secondary mt-3">
                trigger a swipe, sms, discord message, or electron turn.
              </p>
            </div>
          ) : (
            <ol>
              <AnimatePresence initial={false}>
                {filtered.map((e) => (
                  <Row
                    key={e.id}
                    event={e}
                    now={now}
                    expanded={expandedId === e.id}
                    onToggle={() =>
                      setExpandedId((prev) => (prev === e.id ? null : e.id))
                    }
                  />
                ))}
              </AnimatePresence>
            </ol>
          )}
        </div>
      </main>

      {/* right rail — legend + counts + new counter */}
      <aside className="hairline border-l hidden tablet:flex flex-col gutter py-6 gap-6">
        <div>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-secondary">
            new since you opened
          </span>
          <div className="font-display italic text-[64px] leading-none text-ink-primary mt-1 tabular-nums">
            {newSinceOpened}
          </div>
        </div>

        <div className="hairline border-t pt-4">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-secondary">
            legend
          </span>
          <ul className="mt-3 flex flex-col gap-1.5">
            {ALL_SURFACES.map((s) => {
              const meta = SURFACE_META[s];
              return (
                <li key={s} className="flex items-center justify-between">
                  <span
                    className={`inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] px-1.5 py-0.5 rounded-sm ${meta.bg} ${meta.fg}`}
                  >
                    {meta.label}
                  </span>
                  <span className="font-mono text-[10px] tabular-nums text-muted-deep">
                    {counts[s] ?? 0}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="hairline border-t pt-4 mt-auto">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-secondary">
            pitch
          </span>
          <p className="font-display italic text-[16px] text-ink-near leading-snug mt-2">
            “same memory.<br />every surface.<br />one timeline.”
          </p>
        </div>
      </aside>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// row
// ──────────────────────────────────────────────────────────────────────────

function Row({
  event,
  now,
  expanded,
  onToggle,
}: {
  event: TimelineEvent;
  now: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const meta = SURFACE_META[event.surface];
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -8, backgroundColor: 'rgba(255, 79, 139, 0.08)' }}
      animate={{ opacity: 1, y: 0, backgroundColor: 'rgba(255, 79, 139, 0)' }}
      exit={{ opacity: 0, y: -4 }}
      transition={{
        opacity: { duration: 0.4 },
        y: { duration: 0.4, ease: [0, 0, 0, 1] },
        backgroundColor: { duration: 1.4, ease: 'easeOut' },
        layout: { duration: 0.3, ease: [0, 0, 0, 1] },
      }}
      className="hairline border-b"
    >
      <button
        onClick={onToggle}
        className="w-full text-left gutter py-2.5 flex items-center gap-3 hover:bg-soft/60 transition-colors"
      >
        <span
          className={`flex-shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-sm font-mono text-[9px] uppercase tracking-[0.14em] ${meta.bg} ${meta.fg} ring-1 ring-inset ${meta.ring}`}
          style={{ minWidth: 76, justifyContent: 'center' }}
        >
          {meta.label}
        </span>
        <span
          className="flex-shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-secondary tabular-nums"
          title={absoluteTime(event.timestamp)}
          style={{ minWidth: 64 }}
        >
          {relativeTime(event.timestamp, now)}
        </span>
        <span className="flex-1 min-w-0 font-sans text-[13px] text-ink-near truncate">
          {event.preview}
        </span>
        {event.user && (
          <span className="flex-shrink-0 font-mono text-[10px] text-muted-tertiary truncate max-w-[140px]">
            {event.user}
          </span>
        )}
        <span
          className="flex-shrink-0 font-mono text-[10px] text-muted-tertiary"
          aria-hidden
        >
          {expanded ? '▾' : '▸'}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0, 0, 0, 1] }}
            className="overflow-hidden"
          >
            <div className="gutter py-4 bg-soft/40 hairline border-t">
              <ExpandedDetail event={event} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

function ExpandedDetail({ event }: { event: TimelineEvent }) {
  const full = (event.full ?? {}) as Record<string, unknown>;
  // Pull the most useful fields up; dump the rest as JSON.
  const interesting: Array<[string, unknown]> = [];
  const skip = new Set(['_id', '_creationTime']);
  const promoted = [
    'systemPromptFull',
    'userInput',
    'output',
    'toolsCalled',
    'body',
    'content',
    'summary',
    'kind',
    'type',
    'direction',
    'phoneNumber',
    'discordUserId',
    'discordChannelId',
    'metadata',
    'payload',
    'sourceUrl',
    'latencyMs',
    'turnId',
    'systemPromptHash',
    'cardId',
    'round',
    'decision',
    'currentCentroid',
    'counter',
    'source',
    'note',
  ];
  for (const k of promoted) {
    if (k in full && full[k] !== undefined && full[k] !== null && full[k] !== '') {
      interesting.push([k, full[k]]);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-deep">
        <span>{absoluteTime(event.timestamp)}</span>
        <span className="text-hairline">·</span>
        <span>{event.surface}</span>
        {event.direction && (
          <>
            <span className="text-hairline">·</span>
            <span>{event.direction}</span>
          </>
        )}
      </div>

      {interesting.map(([k, v]) => (
        <div key={k} className="flex flex-col gap-1">
          <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-secondary">
            {k}
          </span>
          <pre className="font-mono text-[11px] leading-relaxed text-ink-near bg-cloud px-3 py-2 rounded-sm whitespace-pre-wrap break-words border border-hairline/60 max-h-[280px] overflow-auto">
            {typeof v === 'string' ? v : JSON.stringify(v, null, 2)}
          </pre>
        </div>
      ))}

      {Object.keys(full).filter((k) => !promoted.includes(k) && !skip.has(k))
        .length > 0 && (
        <details>
          <summary className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-secondary cursor-pointer">
            raw
          </summary>
          <pre className="font-mono text-[10px] leading-relaxed text-muted-deep bg-cloud/60 p-3 rounded-sm whitespace-pre-wrap break-words border border-hairline/40 mt-2 max-h-[240px] overflow-auto">
            {JSON.stringify(full, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
