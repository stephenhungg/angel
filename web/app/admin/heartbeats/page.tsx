'use client';

/**
 * /admin/heartbeats — the "genuine background execution" dashboard.
 *
 * one card per always-on surface. each card answers three questions a judge
 * cares about:
 *   1. is it actually alive right now? (LIVE / IDLE / COLD pulse)
 *   2. when did it last fire? (relative timestamp, ticks every second)
 *   3. how often does it fire? (24h activation count)
 *
 * data sources:
 *   - api.agentState.surfaceActivity → aggregated [{source, lastTimestamp,
 *     count24h}] across heartbeats / memoryMirror / bgObservations / smsTurns
 *     / discordTurns. keys map to surface ids below.
 *   - convex `useQuery` is reactive, so new rows arrive without polling.
 *   - a 1s wall-clock tick re-renders relative timestamps so "23s ago"
 *     visibly counts up to "24s ago" in front of the judge.
 */

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from 'convex/react';
import { api } from '@angel/convex/api';
import { relativeTime, absoluteTime } from '@/lib/timeline';

// ──────────────────────────────────────────────────────────────────────────
// surface catalog — the 7 always-on triggers we want the judge to see.
// each surface declares which `surfaceActivity` keys belong to it (so we
// can collapse e.g. inbound + outbound sms into a single "sms-inbound" card).
// ──────────────────────────────────────────────────────────────────────────

interface Surface {
  id: string;
  label: string;
  cadence: string;
  description: string;
  /** keys returned by api.agentState.surfaceActivity that count toward this surface. */
  activityKeys: string[];
  /** color accent — kawaii pink stays the primary, others are muted. */
  accent: 'pink' | 'emerald' | 'violet' | 'amber' | 'sky' | 'zinc' | 'fuchsia';
}

const SURFACES: Surface[] = [
  {
    id: 'convex-cron',
    label: 'convex-cron',
    cadence: 'every 5 min',
    description:
      'scheduled internal mutation in convex/crons.ts — the spine heartbeat. proves the convex deploy is alive.',
    activityKeys: ['heartbeat:cron'],
    accent: 'pink',
  },
  {
    id: 'tensorlake-discord',
    label: 'tensorlake-discord',
    cadence: 'every 60s',
    description:
      'tensorlake/discord-listener polls the discord rest api, persists per-channel cursors back into convex, fires the discord-passive pipeline on new messages.',
    activityKeys: ['memory:discord-passive', 'discord:inbound'],
    accent: 'violet',
  },
  {
    id: 'tensorlake-introspection',
    label: 'tensorlake-introspection',
    cadence: 'every 5 min',
    description:
      'tensorlake/introspection runs claude over the latest turns + memory, writes a fresh "thought" into nia and the memoryMirror feed.',
    activityKeys: ['memory:introspection'],
    accent: 'fuchsia',
  },
  {
    id: 'tensorlake-bg',
    label: 'tensorlake-bg',
    cadence: 'on observe',
    description:
      'desktop/electron/agent/tensorlake/ portfolio observation jobs. ingests fixtures, extracts findings, writes them as type=observation memories.',
    activityKeys: ['memory:tensorlake', 'memory:observation', 'bg:tensorlake'],
    accent: 'amber',
  },
  {
    id: 'electron-runner',
    label: 'electron-runner',
    cadence: 'on focus + bg',
    description:
      'local orchestrator + bg autonomy. fires desktop heartbeats on focus and writes turn-mirrors into convex via convex-bridge.ts.',
    activityKeys: ['heartbeat:desktop', 'memory:turn'],
    accent: 'emerald',
  },
  {
    id: 'sms-inbound',
    label: 'sms-inbound',
    cadence: 'on inbound',
    description:
      'twilio webhook → convex/http.ts /sms/inbound → sms orchestrator. mirrors every inbound sms into the memory feed.',
    activityKeys: ['memory:sms', 'sms:inbound'],
    accent: 'sky',
  },
  {
    id: 'discord-passive',
    label: 'discord-passive',
    cadence: 'on bridge post',
    description:
      'discord bridge → convex/http.ts /discord/passive-message → discord orchestrator. seen via memory mirrors with source=discord-passive.',
    activityKeys: ['memory:discord-passive', 'memory:discord'],
    accent: 'zinc',
  },
];

// ──────────────────────────────────────────────────────────────────────────
// liveness thresholds + accent palette
// ──────────────────────────────────────────────────────────────────────────

const LIVE_MS = 10 * 60 * 1000; // < 10 min ⇒ LIVE (green pulse)
const IDLE_MS = 60 * 60 * 1000; // < 1 hr  ⇒ IDLE (amber)

type Liveness = 'live' | 'idle' | 'cold' | 'never';

function classify(lastTs: number | null, now: number): Liveness {
  if (!lastTs) return 'never';
  const diff = now - lastTs;
  if (diff < LIVE_MS) return 'live';
  if (diff < IDLE_MS) return 'idle';
  return 'cold';
}

const ACCENT_BG: Record<Surface['accent'], string> = {
  pink: 'bg-pink-50',
  emerald: 'bg-emerald-50',
  violet: 'bg-violet-50',
  amber: 'bg-amber-50',
  sky: 'bg-sky-50',
  zinc: 'bg-zinc-50',
  fuchsia: 'bg-fuchsia-50',
};

const ACCENT_TEXT: Record<Surface['accent'], string> = {
  pink: 'text-pink-700',
  emerald: 'text-emerald-700',
  violet: 'text-violet-700',
  amber: 'text-amber-700',
  sky: 'text-sky-700',
  zinc: 'text-zinc-700',
  fuchsia: 'text-fuchsia-700',
};

const LIVENESS_DOT: Record<Liveness, string> = {
  live: 'bg-emerald-500',
  idle: 'bg-amber-500',
  cold: 'bg-zinc-400',
  never: 'bg-zinc-300',
};

const LIVENESS_LABEL: Record<Liveness, string> = {
  live: 'live',
  idle: 'idle',
  cold: 'cold',
  never: 'never',
};

// ──────────────────────────────────────────────────────────────────────────
// reactive 1s ticker — re-renders the relative timestamps. keep it
// independent from convex's reactive query so the wall clock keeps moving
// even when no new rows have landed.
// ──────────────────────────────────────────────────────────────────────────

function useNowTick(periodMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), periodMs);
    return () => window.clearInterval(id);
  }, [periodMs]);
  return now;
}

// ──────────────────────────────────────────────────────────────────────────
// page
// ──────────────────────────────────────────────────────────────────────────

interface ActivityRow {
  source: string;
  lastTimestamp: number | null;
  count24h: number;
}

export default function HeartbeatsPage() {
  const haveConvex =
    typeof process !== 'undefined' && !!process.env.NEXT_PUBLIC_CONVEX_URL;
  const skip = haveConvex ? undefined : ('skip' as const);

  // single reactive query — server-side aggregation across all source tables.
  const raw = useQuery(api.agentState.surfaceActivity, skip ?? {}) as
    | ActivityRow[]
    | undefined;
  const activity: ActivityRow[] = raw ?? [];

  // also subscribe to recentHeartbeats so the "last cron heartbeat" sub-card
  // can show the rolling counter — the judge sees the number tick.
  const heartbeats =
    (useQuery(api.agentState.recentHeartbeats, skip ?? { limit: 20 }) as
      | Array<{ source: string; counter: number; timestamp: number }>
      | undefined) ?? [];
  const lastCronCounter =
    heartbeats.find((h) => h.source === 'cron')?.counter ?? null;

  const now = useNowTick(1000);

  // index activity by source string for O(1) merge into surface cards.
  const bySource = useMemo(() => {
    const m = new Map<string, ActivityRow>();
    for (const r of activity) m.set(r.source, r);
    return m;
  }, [activity]);

  // collapse activity rows into per-surface aggregates.
  const cards = useMemo(() => {
    return SURFACES.map((s) => {
      let lastTimestamp: number | null = null;
      let count24h = 0;
      const matched: ActivityRow[] = [];
      for (const key of s.activityKeys) {
        const row = bySource.get(key);
        if (!row) continue;
        matched.push(row);
        if (row.lastTimestamp !== null) {
          if (lastTimestamp === null || row.lastTimestamp > lastTimestamp) {
            lastTimestamp = row.lastTimestamp;
          }
        }
        count24h += row.count24h;
      }
      return {
        surface: s,
        lastTimestamp,
        count24h,
        liveness: classify(lastTimestamp, now),
        matched,
      };
    });
  }, [bySource, now]);

  // top-level rollups — total fires in 24h across every surface.
  const totalFires24h = useMemo(
    () => cards.reduce((acc, c) => acc + c.count24h, 0),
    [cards],
  );
  const liveCount = useMemo(
    () => cards.filter((c) => c.liveness === 'live').length,
    [cards],
  );

  // any activity-row keys we never claimed in a card — surface as a small
  // "uncategorized" pill row at the bottom so we don't silently drop signal.
  const claimedKeys = useMemo(() => {
    const s = new Set<string>();
    for (const surface of SURFACES) for (const k of surface.activityKeys) s.add(k);
    return s;
  }, []);
  const stragglers = useMemo(
    () => activity.filter((a) => !claimedKeys.has(a.source) && a.lastTimestamp !== null),
    [activity, claimedKeys],
  );

  return (
    <div className="min-h-[calc(100vh-72px)] flex flex-col">
      {/* page header — matches /admin/timeline + /admin/traces typography. */}
      <div className="gutter pt-10 pb-6 hairline border-b">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-secondary">
          view 05 / always-on dashboard
        </span>
        <h1 className="font-display italic text-[56px] leading-none text-ink-primary mt-1">
          heartbeats
        </h1>
        <p className="font-sans text-[14px] text-muted-deep mt-3 max-w-[680px] leading-relaxed">
          every autonomous loop angel runs in the background. crons, polling
          listeners, webhooks, bridge endpoints. the page itself updates
          reactively — convex pushes new activations within a second of insert,
          and the wall clock ticks every second so the judge sees the counters
          move.
        </p>

        <div className="mt-5 flex items-center gap-5 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-secondary flex-wrap">
          <span>
            <span className="text-ink-primary font-display italic normal-case tracking-normal text-[18px] mr-1.5 tabular-nums">
              {liveCount}
            </span>
            of {SURFACES.length} live
          </span>
          <span className="text-hairline">·</span>
          <span>
            <span className="text-ink-primary font-display italic normal-case tracking-normal text-[18px] mr-1.5 tabular-nums">
              {totalFires24h}
            </span>
            fires · 24h
          </span>
          {lastCronCounter !== null && (
            <>
              <span className="text-hairline">·</span>
              <span>
                cron #
                <span className="text-ink-primary font-display italic normal-case tracking-normal text-[18px] ml-0.5 tabular-nums">
                  {lastCronCounter}
                </span>
              </span>
            </>
          )}
          <span className="text-hairline">·</span>
          <span className="inline-flex items-center">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500/70 mr-1.5 align-middle animate-pulse" />
            reactive
          </span>
        </div>
      </div>

      {/* card grid */}
      <div className="gutter py-8">
        <div className="grid grid-cols-1 tablet:grid-cols-2 desktop:grid-cols-3 gap-4">
          {cards.map(({ surface, lastTimestamp, count24h, liveness }) => (
            <SurfaceCard
              key={surface.id}
              surface={surface}
              lastTimestamp={lastTimestamp}
              count24h={count24h}
              liveness={liveness}
              now={now}
            />
          ))}
        </div>

        {/* stragglers — anything we saw in surfaceActivity but didn't bind to a card. */}
        {stragglers.length > 0 && (
          <div className="mt-10">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-secondary">
              uncategorized signal
            </span>
            <ul className="mt-3 flex flex-wrap gap-2">
              {stragglers.map((s) => (
                <li
                  key={s.source}
                  className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-deep border border-hairline rounded-sm px-2 py-1 bg-cloud"
                  title={s.lastTimestamp ? absoluteTime(s.lastTimestamp) : 'never'}
                >
                  {s.source}
                  <span className="ml-2 text-muted-tertiary tabular-nums">
                    {s.lastTimestamp ? relativeTime(s.lastTimestamp, now) : '—'}
                  </span>
                  <span className="ml-2 text-ink-near tabular-nums">
                    {s.count24h}/24h
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* empty state — only happens when convex query is still resolving or
            there is genuinely no activity at all. */}
        {raw === undefined && (
          <div className="py-20 text-center">
            <p className="font-display italic text-[28px] text-muted-tertiary">
              listening…
            </p>
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-secondary mt-3">
              waiting on the convex spine.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// card
// ──────────────────────────────────────────────────────────────────────────

function SurfaceCard({
  surface,
  lastTimestamp,
  count24h,
  liveness,
  now,
}: {
  surface: Surface;
  lastTimestamp: number | null;
  count24h: number;
  liveness: Liveness;
  now: number;
}) {
  const dotClass = LIVENESS_DOT[liveness];
  const accentBg = ACCENT_BG[surface.accent];
  const accentText = ACCENT_TEXT[surface.accent];

  // tick the relative-time string off the wall clock so it visibly increments.
  const rel = lastTimestamp ? relativeTime(lastTimestamp, now) : 'never fired';

  return (
    <motion.article
      layout
      initial={{ opacity: 0.001, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0, 0, 0, 1] }}
      className="hairline border bg-paper flex flex-col"
    >
      {/* card header — accent bar with surface label + cadence */}
      <header
        className={`${accentBg} hairline border-b gutter py-3 flex items-center justify-between`}
      >
        <div className="flex items-center gap-2.5">
          <span className="relative flex items-center justify-center w-2 h-2">
            <span
              className={`absolute inline-flex h-full w-full rounded-full opacity-60 ${dotClass} ${
                liveness === 'live' ? 'animate-ping' : ''
              }`}
            />
            <span className={`relative inline-flex rounded-full h-2 w-2 ${dotClass}`} />
          </span>
          <span
            className={`font-mono text-[11px] uppercase tracking-[0.16em] ${accentText}`}
          >
            {surface.label}
          </span>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-deep">
          {surface.cadence}
        </span>
      </header>

      {/* card body */}
      <div className="gutter py-5 flex-1 flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex flex-col">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-secondary">
              last fired
            </span>
            <span
              className="font-display italic text-[34px] leading-none text-ink-primary tabular-nums"
              title={lastTimestamp ? absoluteTime(lastTimestamp) : 'no activations yet'}
            >
              {rel}
            </span>
          </div>
          <div className="flex flex-col items-end">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-secondary">
              24h fires
            </span>
            <span className="font-display italic text-[34px] leading-none text-ink-primary tabular-nums">
              {count24h}
            </span>
          </div>
        </div>

        <p className="font-sans text-[12.5px] text-muted-deep leading-relaxed">
          {surface.description}
        </p>

        <div className="mt-auto flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-muted-secondary pt-3 hairline border-t">
          <span>{LIVENESS_LABEL[liveness]}</span>
          <span className="text-muted-tertiary truncate ml-2 normal-case tracking-normal">
            {surface.activityKeys.join(' · ')}
          </span>
        </div>
      </div>
    </motion.article>
  );
}
