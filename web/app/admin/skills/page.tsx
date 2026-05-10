'use client';

/**
 * /admin/skills — angel's recursive self-improvement, on stage.
 *
 * her propose_skill tool writes a markdown file to ~/.angel/skills/proposed/.
 * that hook now ALSO mirrors the row into convex (skills/mirror.ts), and
 * this page subscribes reactively. mid-demo: she calls the tool → judges
 * see a new card pulse in on the left column within ~1s. that's the agentic-
 * depth beat — she literally writes a skill for herself, on stage, live.
 *
 * three columns:
 *   PROPOSED (sakura)  — drafts she's pending approval on
 *   ACTIVE   (ink)     — installed; load into her system prompt next session
 *   ARCHIVED (muted)   — retired
 *
 * cards that bumped in the last 60s get a sakura ring + animate-pulse so the
 * latest event reads at a glance. click a proposed card to expand the
 * markdown body — judges can read what she actually wrote.
 */

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from 'convex/react';
import { api } from '@angel/convex/api';
import { relativeTime, absoluteTime } from '@/lib/timeline';

// ──────────────────────────────────────────────────────────────────────────
// types
// ──────────────────────────────────────────────────────────────────────────

interface SkillRow {
  _id: string;
  userId: string;
  slug: string;
  name: string;
  description: string;
  status: string; // 'proposed' | 'active' | 'archived'
  content: string;
  origin?: string;
  proposedAt: string;
  bumpedAt: number;
}

// ──────────────────────────────────────────────────────────────────────────
// 1s wall-clock tick — keeps "12s ago" visibly counting up.
// ──────────────────────────────────────────────────────────────────────────

function useNowTick(periodMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), periodMs);
    return () => window.clearInterval(id);
  }, [periodMs]);
  return now;
}

const FRESH_MS = 60_000; // < 60s → pulse the sakura ring

// ──────────────────────────────────────────────────────────────────────────
// page
// ──────────────────────────────────────────────────────────────────────────

export default function SkillsPage() {
  const haveConvex =
    typeof process !== 'undefined' && !!process.env.NEXT_PUBLIC_CONVEX_URL;
  const skip = haveConvex ? undefined : ('skip' as const);

  const raw = useQuery(api['skills/mirror'].recentSkills, skip ?? { limit: 50 }) as
    | SkillRow[]
    | undefined;
  const skills: SkillRow[] = raw ?? [];
  const now = useNowTick(1000);

  const [expanded, setExpanded] = useState<string | null>(null);

  const { proposed, active, archived } = useMemo(() => {
    const p: SkillRow[] = [];
    const a: SkillRow[] = [];
    const x: SkillRow[] = [];
    for (const s of skills) {
      if (s.status === 'active') a.push(s);
      else if (s.status === 'archived') x.push(s);
      else p.push(s); // default + 'proposed'
    }
    return { proposed: p, active: a, archived: x };
  }, [skills]);

  const totalUses = skills.length;
  const freshCount = useMemo(
    () => skills.filter((s) => now - s.bumpedAt < FRESH_MS).length,
    [skills, now],
  );

  return (
    <div className="min-h-[calc(100vh-72px)] flex flex-col">
      {/* page header */}
      <div className="gutter pt-10 pb-6 hairline border-b">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-secondary">
          view 06 / recursive self-improvement
        </span>
        <h1 className="font-display italic text-[56px] leading-none text-ink-primary mt-1">
          skills
        </h1>
        <p className="font-sans text-[14px] text-muted-deep mt-3 max-w-[680px] leading-relaxed">
          when angel notices a recurring pattern, she calls{' '}
          <code className="font-mono text-[12px] text-ink-near">propose_skill</code>{' '}
          and writes herself a markdown file at{' '}
          <code className="font-mono text-[12px] text-ink-near">~/.angel/skills/proposed/</code>.
          approved skills load into her system prompt next session — procedural
          memory that compounds. this page mirrors disk in real-time; new
          proposals appear within a second of the tool call.
        </p>

        <div className="mt-5 flex items-center gap-5 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-secondary flex-wrap">
          <span>
            <span className="text-pink-700 font-display italic normal-case tracking-normal text-[18px] mr-1.5 tabular-nums">
              {proposed.length}
            </span>
            proposed
          </span>
          <span className="text-hairline">·</span>
          <span>
            <span className="text-ink-primary font-display italic normal-case tracking-normal text-[18px] mr-1.5 tabular-nums">
              {active.length}
            </span>
            active
          </span>
          <span className="text-hairline">·</span>
          <span>
            <span className="text-muted-tertiary font-display italic normal-case tracking-normal text-[18px] mr-1.5 tabular-nums">
              {archived.length}
            </span>
            archived
          </span>
          <span className="text-hairline">·</span>
          <span>
            <span className="text-ink-primary font-display italic normal-case tracking-normal text-[18px] mr-1.5 tabular-nums">
              {totalUses}
            </span>
            total
          </span>
          {freshCount > 0 && (
            <>
              <span className="text-hairline">·</span>
              <span className="inline-flex items-center text-pink-700">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-pink-400 mr-1.5 align-middle animate-pulse" />
                {freshCount} fresh
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

      {/* three-column layout */}
      <div className="gutter py-8 grid grid-cols-1 desktop:grid-cols-[1.2fr_1fr_0.8fr] gap-6">
        {/* PROPOSED */}
        <Column
          label="proposed"
          subLabel="awaiting approval"
          accent="pink"
          count={proposed.length}
          empty="no drafts yet — she'll write one when she notices a pattern."
        >
          <AnimatePresence initial={false}>
            {proposed.map((s) => (
              <SkillCard
                key={s._id}
                skill={s}
                now={now}
                accent="pink"
                expanded={expanded === s._id}
                onToggle={() => setExpanded((cur) => (cur === s._id ? null : s._id))}
              />
            ))}
          </AnimatePresence>
        </Column>

        {/* ACTIVE */}
        <Column
          label="active"
          subLabel="loaded into her prompt"
          accent="ink"
          count={active.length}
          empty="no skills installed yet."
        >
          <AnimatePresence initial={false}>
            {active.map((s) => (
              <SkillCard
                key={s._id}
                skill={s}
                now={now}
                accent="ink"
                expanded={expanded === s._id}
                onToggle={() => setExpanded((cur) => (cur === s._id ? null : s._id))}
              />
            ))}
          </AnimatePresence>
        </Column>

        {/* ARCHIVED */}
        <Column
          label="archived"
          subLabel="retired"
          accent="muted"
          count={archived.length}
          empty="—"
          dense
        >
          <AnimatePresence initial={false}>
            {archived.map((s) => (
              <SkillCard
                key={s._id}
                skill={s}
                now={now}
                accent="muted"
                expanded={expanded === s._id}
                onToggle={() => setExpanded((cur) => (cur === s._id ? null : s._id))}
                dense
              />
            ))}
          </AnimatePresence>
        </Column>
      </div>

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
  );
}

// ──────────────────────────────────────────────────────────────────────────
// column
// ──────────────────────────────────────────────────────────────────────────

type Accent = 'pink' | 'ink' | 'muted';

const COL_ACCENT_BG: Record<Accent, string> = {
  pink: 'bg-pink-50',
  ink: 'bg-cloud',
  muted: 'bg-paper',
};
const COL_ACCENT_TEXT: Record<Accent, string> = {
  pink: 'text-pink-700',
  ink: 'text-ink-primary',
  muted: 'text-muted-tertiary',
};

function Column({
  label,
  subLabel,
  accent,
  count,
  empty,
  children,
  dense = false,
}: React.PropsWithChildren<{
  label: string;
  subLabel: string;
  accent: Accent;
  count: number;
  empty: string;
  dense?: boolean;
}>) {
  return (
    <section className="flex flex-col min-w-0">
      <header
        className={`${COL_ACCENT_BG[accent]} hairline border gutter py-3 flex items-baseline justify-between mb-3`}
      >
        <div className="flex flex-col gap-0.5">
          <span
            className={`font-mono text-[11px] uppercase tracking-[0.16em] ${COL_ACCENT_TEXT[accent]}`}
          >
            {label}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-secondary">
            {subLabel}
          </span>
        </div>
        <span
          className={`font-display italic text-[28px] leading-none tabular-nums ${COL_ACCENT_TEXT[accent]}`}
        >
          {count}
        </span>
      </header>

      <div className={`flex flex-col ${dense ? 'gap-1.5' : 'gap-3'}`}>
        {count === 0 && (
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-tertiary px-1 py-2">
            {empty}
          </p>
        )}
        {children}
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// card
// ──────────────────────────────────────────────────────────────────────────

function SkillCard({
  skill,
  now,
  accent,
  expanded,
  onToggle,
  dense = false,
}: {
  skill: SkillRow;
  now: number;
  accent: Accent;
  expanded: boolean;
  onToggle: () => void;
  dense?: boolean;
}) {
  const fresh = now - skill.bumpedAt < FRESH_MS;
  const rel = relativeTime(skill.bumpedAt, now);

  // ring + glow for fresh cards regardless of column. sakura ring on
  // proposed (which is where the demo moment lands) — softer ring on
  // active/archived in case she gets approved live.
  const ringClass = fresh
    ? accent === 'pink'
      ? 'ring-2 ring-pink-300 ring-offset-2 ring-offset-paper animate-pulse'
      : 'ring-2 ring-pink-200 ring-offset-2 ring-offset-paper animate-pulse'
    : '';

  if (dense) {
    return (
      <motion.button
        layout
        type="button"
        onClick={onToggle}
        initial={{ opacity: 0.001, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.35, ease: [0, 0, 0, 1] }}
        className={`hairline border bg-paper text-left gutter py-2 flex items-baseline justify-between gap-3 hover:bg-cloud/50 transition-colors ${ringClass}`}
        title={absoluteTime(skill.bumpedAt)}
      >
        <span className="font-bagel text-[14px] text-muted-deep truncate">
          {skill.name}
        </span>
        <span className="font-mono text-[10px] text-muted-tertiary tabular-nums shrink-0">
          {rel}
        </span>
      </motion.button>
    );
  }

  return (
    <motion.article
      layout
      initial={{ opacity: 0.001, y: 6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.98 }}
      transition={{ duration: 0.45, ease: [0, 0, 0, 1] }}
      className={`hairline border bg-paper flex flex-col cursor-pointer hover:shadow-sm transition-shadow ${ringClass}`}
      onClick={onToggle}
    >
      <div className="gutter py-4 flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-bagel text-[20px] text-ink-primary leading-tight truncate">
            {skill.name}
          </h3>
          <span
            className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-secondary tabular-nums shrink-0"
            title={absoluteTime(skill.bumpedAt)}
          >
            {rel}
          </span>
        </div>

        <p className="font-sans text-[13px] text-muted-deep leading-relaxed line-clamp-2">
          {skill.description}
        </p>

        {skill.origin && (
          <p className="font-sans italic text-[11px] text-muted-tertiary leading-snug">
            she noticed: {skill.origin}
          </p>
        )}

        <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-muted-tertiary pt-2 hairline border-t mt-1">
          <span className="truncate">{skill.slug}</span>
          <span className="shrink-0 ml-2">
            {expanded ? 'collapse' : 'expand'}
          </span>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0, 0, 0, 1] }}
            className="overflow-hidden hairline border-t bg-cloud/40"
            onClick={(e) => e.stopPropagation()}
          >
            <pre className="font-mono text-[11px] leading-relaxed text-ink-near gutter py-3 whitespace-pre-wrap break-words max-h-[420px] overflow-y-auto">
              {skill.content || '(empty)'}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}
