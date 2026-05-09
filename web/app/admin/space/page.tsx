'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  computePcaBasis,
  projectAll,
  projectInto,
  MOCK_LIBRARY,
  MACROS,
  type Vec5,
} from '@/lib/pca';
import { useLiveVisitors, type VisitorTrace } from '@/lib/admin-live';

/**
 * /admin/space — live trait-space viewer.
 *
 * the killer flex. ~30 (mock 200) library thumbnails as faded portraits at
 * their PCA-projected positions, three macro centroids as labeled rings,
 * every visitor's swipe centroid as a glowing dot — plotted in real time as
 * they swipe.
 *
 * aesthetic: warm paper background, lowercase trait words floating in the
 * corners at low opacity, no axes, no gridlines. should feel like an artist's
 * wall, not a dashboard. animation is springy, never abrupt — visitors
 * arriving slide in with a soft scale.
 */

const TRAIT_CORNERS = [
  { label: 'cool', x: 0.04, y: 0.06 },
  { label: 'warm', x: 0.96, y: 0.06 },
  { label: 'still', x: 0.04, y: 0.94 },
  { label: 'vivid', x: 0.96, y: 0.94 },
  { label: 'sharp', x: 0.5, y: 0.04 },
  { label: 'soft', x: 0.5, y: 0.96 },
];

export default function SpacePage() {
  const basis = useMemo(() => computePcaBasis(MOCK_LIBRARY), []);
  const { points: libraryPoints, range } = useMemo(
    () => projectAll(MOCK_LIBRARY, basis),
    [basis],
  );

  const macroProjections = useMemo(
    () =>
      MACROS.map((m) => ({
        ...m,
        ...projectInto(m.vector, basis, range),
      })),
    [basis, range],
  );

  const visitors = useLiveVisitors();
  const visitorProjections = useMemo(
    () =>
      visitors.map((v) => ({
        userId: v.userId,
        displayName: v.displayName,
        finalMacro: v.finalMacro,
        ...projectInto(v.centroid as Vec5, basis, range),
      })),
    [visitors, basis, range],
  );

  const [selected, setSelected] = useState<VisitorTrace | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // when a new visitor projection comes in, briefly pulse them.
  const [recentlyMoved, setRecentlyMoved] = useState<Record<string, number>>({});
  useEffect(() => {
    const now = Date.now();
    const next: Record<string, number> = {};
    for (const v of visitorProjections) next[v.userId] = now;
    setRecentlyMoved((prev) => ({ ...prev, ...next }));
  }, [visitorProjections]);

  // helper: convert projected -1..1 → 0..1 with 8% inner padding.
  const px = (n: number) => 0.5 + n * 0.42;

  return (
    <div className="relative w-full min-h-[calc(100vh-72px)] flex flex-col">
      {/* page header — kept minimal, page is the canvas. */}
      <div className="gutter pt-10 pb-6 flex items-end justify-between">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-secondary">
            view 01 / live trait-space
          </span>
          <h1 className="font-display italic text-[64px] leading-none text-ink-primary">
            the wall
          </h1>
          <p className="font-sans text-[14px] text-muted-deep mt-2 max-w-[440px] leading-relaxed">
            ~{MOCK_LIBRARY.length} portraits, projected into the 2d shadow of a
            5d trait vector. each glowing dot is a visitor swiping right now.
          </p>
        </div>

        <div className="hidden tablet:flex items-center gap-8 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-secondary">
          <span>
            <span className="block text-[20px] text-ink-primary font-display italic normal-case tracking-normal">
              {visitors.length}
            </span>
            visitors
          </span>
          <span>
            <span className="block text-[20px] text-ink-primary font-display italic normal-case tracking-normal">
              {visitors.reduce((acc, v) => acc + v.swipes.length, 0)}
            </span>
            swipes
          </span>
          <span>
            <span className="block text-[20px] text-ink-primary font-display italic normal-case tracking-normal">
              {(basis.explained[0] * 100).toFixed(0) +
                '/' +
                (basis.explained[1] * 100).toFixed(0)}
            </span>
            pc1 / pc2 %
          </span>
        </div>
      </div>

      {/* the canvas */}
      <div className="flex-1 gutter pb-10 min-h-[640px]">
        <div
          ref={canvasRef}
          className="relative w-full h-[min(78vh,820px)] overflow-hidden rounded-md"
          style={{
            background:
              'radial-gradient(ellipse 80% 60% at 70% 30%, #fff8ee 0%, #fbfbfb 45%, #f4f0ea 100%)',
            boxShadow: 'inset 0 0 0 1px var(--hairline)',
          }}
        >
          {/* corner trait labels */}
          {TRAIT_CORNERS.map((c) => (
            <span
              key={c.label}
              className="absolute font-display italic text-[20px] text-ink-near pointer-events-none select-none"
              style={{
                left: `${c.x * 100}%`,
                top: `${c.y * 100}%`,
                transform: 'translate(-50%, -50%)',
                opacity: 0.32,
              }}
            >
              {c.label}
            </span>
          ))}

          {/* library thumbnails — faded background field */}
          {libraryPoints.map((p) => (
            <Thumbnail
              key={p.id}
              left={px(p.x)}
              top={px(p.y)}
              id={p.id}
              tone={MOCK_LIBRARY.find((e) => e.id === p.id)?.label ?? 'cute'}
            />
          ))}

          {/* macro centroid rings */}
          {macroProjections.map((m) => (
            <MacroRing
              key={m.id}
              left={px(m.x)}
              top={px(m.y)}
              label={m.label}
              accent={m.id}
            />
          ))}

          {/* visitor dots — glowing, smooth motion */}
          {visitorProjections.map((v) => (
            <VisitorDot
              key={v.userId}
              left={px(v.x)}
              top={px(v.y)}
              displayName={v.displayName}
              macro={v.finalMacro}
              isSelected={selected?.userId === v.userId}
              recentlyMovedAt={recentlyMoved[v.userId]}
              onClick={() => {
                const trace = visitors.find((x) => x.userId === v.userId) ?? null;
                setSelected(trace);
              }}
            />
          ))}

          {/* legend (bottom-left, low-contrast) */}
          <div className="absolute bottom-4 left-4 flex items-center gap-4 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-secondary pointer-events-none">
            <LegendDot color="#1a1a1a" label="library" />
            <LegendDot color="#0099ff" label="visitor" />
            <LegendDot color="rgba(20,20,20,0.4)" label="macro" hollow />
          </div>
        </div>
      </div>

      {/* side panel — slides in from right when a visitor dot is clicked */}
      <AnimatePresence>
        {selected && (
          <motion.aside
            initial={{ x: '100%', opacity: 0.001 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0.001 }}
            transition={{ duration: 0.45, ease: [0, 0, 0, 1] }}
            className="fixed top-[72px] right-0 bottom-0 w-full max-w-[440px] bg-cloud border-l border-hairline z-30 overflow-y-auto"
          >
            <div className="gutter py-8 flex flex-col gap-6">
              <div className="flex items-start justify-between">
                <div className="flex flex-col gap-1">
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-secondary">
                    visitor trace
                  </span>
                  <h2 className="font-display italic text-[40px] leading-none text-ink-primary">
                    {selected.displayName}
                  </h2>
                  <span className="font-mono text-[11px] text-muted-deep mt-1">
                    {new Date(selected.startedAt).toLocaleTimeString()} · {selected.swipes.length} swipes
                  </span>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  className="font-sans text-[13px] font-semibold text-muted-deep hover:text-ink-primary"
                >
                  close
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Stat label="final macro" value={selected.finalMacro ?? '—'} />
                <Stat label="voice cluster" value={String(selected.voiceCluster ?? '—')} />
              </div>

              <CentroidBar centroid={selected.centroid} />

              {/* swipe-by-swipe history */}
              <div className="flex flex-col gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-secondary">
                  swipe path
                </span>
                <ol className="flex flex-col">
                  {selected.swipes.slice(-12).map((s) => (
                    <li
                      key={s._id}
                      className="flex items-center justify-between py-1.5 border-b border-hairline/60 last:border-b-0"
                    >
                      <span className="font-mono text-[11px] text-muted-deep">
                        r{s.round} · {s.cardId}
                      </span>
                      <span
                        className={`font-mono text-[11px] uppercase tracking-[0.14em] ${
                          s.decision === 'yes'
                            ? 'text-emerald-700/80'
                            : 'text-muted-tertiary'
                        }`}
                      >
                        {s.decision}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>

              {/* generated personality.md */}
              <div className="flex flex-col gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-secondary">
                  synthesized personality.md
                </span>
                <pre className="font-mono text-[12px] leading-relaxed text-ink-near bg-soft/60 p-4 rounded-sm whitespace-pre-wrap">
                  {selected.personalityMd}
                </pre>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// sub-components
// ──────────────────────────────────────────────────────────────────────────

const TONE_TINT: Record<string, string> = {
  cute: '#e8c4b8', // soft peach
  pretty: '#d8c79c', // golden tan
  hot: '#9c5a4a', // sharper terracotta
};

function Thumbnail({
  left,
  top,
  id,
  tone,
}: {
  left: number;
  top: number;
  id: string;
  tone: string;
}) {
  const tint = TONE_TINT[tone] ?? '#bbb';
  // deterministic angle/size offsets so the wall feels organic.
  const seed = hashStr(id);
  const angle = ((seed % 1000) / 1000) * 8 - 4; // ±4°
  const size = 22 + (seed % 8); // 22..30px
  return (
    <motion.div
      initial={{ opacity: 0.001, scale: 0.6 }}
      animate={{ opacity: 0.55, scale: 1 }}
      transition={{ duration: 0.9, ease: [0, 0, 0, 1], delay: (seed % 30) * 0.02 }}
      className="absolute pointer-events-none"
      style={{
        left: `${left * 100}%`,
        top: `${top * 100}%`,
        width: size,
        height: size,
        transform: `translate(-50%, -50%) rotate(${angle}deg)`,
      }}
    >
      <div
        className="w-full h-full rounded-sm"
        style={{
          background: `linear-gradient(135deg, ${tint} 0%, ${shade(tint, -15)} 100%)`,
          boxShadow: '0 2px 6px rgba(20,20,20,0.10), inset 0 0 0 1px rgba(255,255,255,0.4)',
        }}
      />
    </motion.div>
  );
}

function MacroRing({
  left,
  top,
  label,
  accent,
}: {
  left: number;
  top: number;
  label: string;
  accent: 'cute' | 'pretty' | 'hot';
}) {
  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: `${left * 100}%`,
        top: `${top * 100}%`,
        transform: 'translate(-50%, -50%)',
      }}
    >
      <motion.div
        className="rounded-full"
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 1.2, ease: [0, 0, 0, 1] }}
        style={{
          width: 110,
          height: 110,
          border: `1px dashed ${TONE_TINT[accent]}`,
        }}
      />
      <motion.div
        className="absolute inset-0 rounded-full"
        animate={{ scale: [1, 1.18, 1], opacity: [0.18, 0, 0.18] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          background: `radial-gradient(circle, ${TONE_TINT[accent]}55 0%, transparent 60%)`,
        }}
      />
      <span
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-display italic text-[18px] text-ink-near whitespace-nowrap"
        style={{ opacity: 0.7 }}
      >
        {label}
      </span>
    </div>
  );
}

function VisitorDot({
  left,
  top,
  displayName,
  macro,
  isSelected,
  recentlyMovedAt,
  onClick,
}: {
  left: number;
  top: number;
  displayName: string;
  macro: 'cute' | 'pretty' | 'hot' | null;
  isSelected: boolean;
  recentlyMovedAt: number | undefined;
  onClick: () => void;
}) {
  const tint = macro ? TONE_TINT[macro] : '#0099ff';
  return (
    <motion.button
      onClick={onClick}
      animate={{ left: `${left * 100}%`, top: `${top * 100}%` }}
      transition={{ type: 'spring', stiffness: 90, damping: 22, mass: 0.8 }}
      className="absolute group"
      style={{
        transform: 'translate(-50%, -50%)',
        width: 14,
        height: 14,
      }}
      aria-label={`visitor ${displayName}`}
    >
      {/* outer halo */}
      <motion.span
        className="absolute inset-0 rounded-full"
        animate={{ scale: [1, 1.9, 1], opacity: [0.4, 0, 0.4] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          background: `radial-gradient(circle, ${tint}cc 0%, transparent 70%)`,
        }}
      />
      {/* core */}
      <span
        className="absolute inset-0 rounded-full transition-all"
        style={{
          background: tint,
          boxShadow: isSelected
            ? `0 0 0 3px var(--paper), 0 0 0 4px ${tint}, 0 0 24px ${tint}`
            : `0 0 14px ${tint}`,
          transform: isSelected ? 'scale(1.3)' : 'scale(1)',
        }}
      />
      {/* hover label */}
      <span
        className="absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2 py-0.5 rounded-sm bg-ink-primary/90 text-cloud font-mono text-[10px] uppercase tracking-[0.14em] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none"
      >
        {displayName}
      </span>
    </motion.button>
  );
}

function LegendDot({
  color,
  label,
  hollow,
}: {
  color: string;
  label: string;
  hollow?: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-block w-2 h-2 rounded-full"
        style={{
          background: hollow ? 'transparent' : color,
          border: hollow ? `1px dashed ${color}` : 'none',
        }}
      />
      {label}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-secondary">
        {label}
      </span>
      <span className="font-display italic text-[28px] text-ink-primary leading-none">
        {value}
      </span>
    </div>
  );
}

const DIM_LABELS = ['warmth', 'energy', 'refinement', 'edge', 'intimacy'];

function CentroidBar({ centroid }: { centroid: Vec5 }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-secondary">
        centroid (5d)
      </span>
      <div className="flex flex-col gap-1.5">
        {DIM_LABELS.map((label, i) => (
          <div key={label} className="flex items-center gap-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-deep w-20">
              {label}
            </span>
            <div className="flex-1 h-px bg-hairline relative">
              <div
                className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-ink-primary"
                style={{ left: `${centroid[i] * 100}%`, transform: `translate(-50%, -50%)` }}
              />
            </div>
            <span className="font-mono text-[10px] text-muted-deep w-8 text-right">
              {centroid[i].toFixed(2)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// utils
// ──────────────────────────────────────────────────────────────────────────

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

function shade(hex: string, percent: number): string {
  const m = hex.replace('#', '');
  const num = parseInt(m, 16);
  let r = (num >> 16) & 0xff;
  let g = (num >> 8) & 0xff;
  let b = num & 0xff;
  r = Math.max(0, Math.min(255, Math.round(r + (255 * percent) / 100)));
  g = Math.max(0, Math.min(255, Math.round(g + (255 * percent) / 100)));
  b = Math.max(0, Math.min(255, Math.round(b + (255 * percent) / 100)));
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}
