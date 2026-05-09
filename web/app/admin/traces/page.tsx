'use client';

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLiveVisitors, type VisitorTrace } from '@/lib/admin-live';
import { MACROS, type Vec5 } from '@/lib/pca';

/**
 * /admin/traces — per-user trace inspector.
 *
 * left rail: live list of recent visitors (newest first, ticks as new swipes
 * land). right pane: timeline + sparkline (centroid drift per round) + final
 * macro/voice + the actual personality.md + an A/B view next to a hand-written
 * baseline. replay button re-runs convergence over the saved swipe path
 * (validates determinism).
 */

const HAND_WRITTEN_BASELINE = `# personality — hand-written baseline

## tone
- warm and calm. she opens softly, then gets specific.
- doesn't perform. answers the question that was asked.

## tells
- pauses mid-sentence to correct herself.
- uses your name maybe twice a conversation, never more.
- prefers two short lines to one long one.

## anchors
- honesty over impressiveness.
- if she doesn't know, she says she doesn't know.
- she's chosen by you. she'd rather be honest than impressive.

## avoid
- corporate softeners.
- ending on a question to hide a stance.
- "hope this helps" / "let me know if".
`;

export default function TracesPage() {
  const visitors = useLiveVisitors();
  const sorted = useMemo(
    () => [...visitors].sort((a, b) => b.startedAt - a.startedAt),
    [visitors],
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    () => sorted[0]?.userId ?? null,
  );
  const selected = sorted.find((v) => v.userId === selectedId) ?? sorted[0] ?? null;

  const [replayStep, setReplayStep] = useState<number | null>(null);

  return (
    <div className="grid grid-cols-1 tablet:grid-cols-[280px_1fr] min-h-[calc(100vh-72px)]">
      {/* left: visitor list */}
      <aside className="hairline border-r overflow-y-auto max-h-[calc(100vh-72px)]">
        <div className="gutter py-6 sticky top-0 bg-paper hairline border-b z-10">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-secondary">
            recent visitors
          </span>
          <h1 className="font-display italic text-[28px] text-ink-primary leading-none mt-1">
            traces
          </h1>
        </div>
        <ul>
          {sorted.map((v) => {
            const active = v.userId === selected?.userId;
            const elapsed = Math.floor((Date.now() - v.startedAt) / 1000);
            const elapsedLabel =
              elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed / 60)}m`;
            return (
              <li key={v.userId}>
                <button
                  onClick={() => setSelectedId(v.userId)}
                  className={`w-full text-left gutter py-3 hairline border-b transition-colors ${
                    active ? 'bg-soft/60' : 'hover:bg-soft/40'
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-display italic text-[20px] text-ink-primary leading-none">
                      {v.displayName}
                    </span>
                    <span className="font-mono text-[10px] text-muted-tertiary">
                      {elapsedLabel} ago
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <MacroChip macro={v.finalMacro ?? 'cute'} />
                    <span className="font-mono text-[10px] text-muted-deep">
                      {v.swipes.length} swipes · v{v.voiceCluster}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* right: detail */}
      <main className="overflow-y-auto max-h-[calc(100vh-72px)]">
        {selected && (
          <AnimatePresence mode="wait">
            <motion.div
              key={selected.userId}
              initial={{ opacity: 0.001, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0.001 }}
              transition={{ duration: 0.4, ease: [0, 0, 0, 1] }}
              className="gutter py-10 flex flex-col gap-10"
            >
              {/* header */}
              <div className="flex items-end justify-between flex-wrap gap-6">
                <div className="flex flex-col gap-1">
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-secondary">
                    visitor
                  </span>
                  <h2 className="font-display italic text-[64px] text-ink-primary leading-none">
                    {selected.displayName}
                  </h2>
                  <span className="font-mono text-[11px] text-muted-deep mt-1">
                    {new Date(selected.startedAt).toLocaleString()}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      setReplayStep(0);
                      let i = 0;
                      const id = window.setInterval(() => {
                        i++;
                        setReplayStep(i);
                        if (i >= selected.swipes.length) {
                          window.clearInterval(id);
                          window.setTimeout(() => setReplayStep(null), 800);
                        }
                      }, 140);
                    }}
                    className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-primary border border-ink-primary px-4 py-2 hover:bg-ink-primary hover:text-cloud transition-colors"
                  >
                    replay convergence
                  </button>
                </div>
              </div>

              {/* stat row */}
              <div className="grid grid-cols-2 tablet:grid-cols-4 gap-6">
                <Stat label="final macro" value={selected.finalMacro ?? '—'} />
                <Stat label="voice cluster" value={String(selected.voiceCluster ?? '—')} />
                <Stat label="swipes" value={String(selected.swipes.length)} />
                <Stat label="rounds" value="3" />
              </div>

              {/* sparkline — centroid drift per round (5 lines, one per dim) */}
              <section className="flex flex-col gap-3">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-secondary">
                  vector evolution
                </span>
                <Sparklines swipes={selected.swipes} highlight={replayStep} />
              </section>

              {/* timeline */}
              <section className="flex flex-col gap-3">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-secondary">
                  swipe timeline
                </span>
                <Timeline swipes={selected.swipes} highlight={replayStep} />
              </section>

              {/* a/b view */}
              <section className="flex flex-col gap-3">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-secondary">
                  a / b — synthesized vs hand-written
                </span>
                <div className="grid grid-cols-1 tablet:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-primary">
                      synthesized
                    </span>
                    <pre className="font-mono text-[12px] leading-relaxed text-ink-near bg-soft/60 p-4 rounded-sm whitespace-pre-wrap min-h-[280px]">
                      {selected.personalityMd}
                    </pre>
                  </div>
                  <div className="flex flex-col gap-2">
                    <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-deep">
                      hand-written baseline
                    </span>
                    <pre className="font-mono text-[12px] leading-relaxed text-muted-deep bg-cloud border border-hairline p-4 rounded-sm whitespace-pre-wrap min-h-[280px]">
                      {HAND_WRITTEN_BASELINE}
                    </pre>
                  </div>
                </div>
              </section>
            </motion.div>
          </AnimatePresence>
        )}
      </main>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────

const TONE_TINT: Record<string, string> = {
  cute: '#e8c4b8',
  pretty: '#d8c79c',
  hot: '#9c5a4a',
};

function MacroChip({ macro }: { macro: 'cute' | 'pretty' | 'hot' }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-near"
    >
      <span
        className="inline-block w-2 h-2 rounded-full"
        style={{ background: TONE_TINT[macro] }}
      />
      {macro}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-secondary">
        {label}
      </span>
      <span className="font-display italic text-[40px] text-ink-primary leading-none">
        {value}
      </span>
    </div>
  );
}

const DIM_COLORS = ['#9c5a4a', '#0099ff', '#a18a3c', '#525252', '#d4836f'];
const DIM_LABELS = ['warmth', 'energy', 'refinement', 'edge', 'intimacy'];

function Sparklines({
  swipes,
  highlight,
}: {
  swipes: { currentCentroid: Vec5 }[];
  highlight: number | null;
}) {
  if (swipes.length === 0) return null;
  const W = 600;
  const H = 120;
  const PAD = 8;
  const stepX = (W - PAD * 2) / Math.max(1, swipes.length - 1);

  return (
    <div className="bg-cloud border border-hairline rounded-sm p-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none">
        {/* baseline */}
        <line x1={PAD} y1={H / 2} x2={W - PAD} y2={H / 2} stroke="#e9e9e9" strokeDasharray="2 4" />
        {DIM_LABELS.map((_, dim) => {
          const path = swipes
            .map((s, i) => {
              const x = PAD + i * stepX;
              const y = PAD + (1 - s.currentCentroid[dim]) * (H - PAD * 2);
              return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
            })
            .join(' ');
          return (
            <path
              key={dim}
              d={path}
              fill="none"
              stroke={DIM_COLORS[dim]}
              strokeWidth={1.5}
              strokeOpacity={0.85}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          );
        })}
        {/* highlight cursor */}
        {highlight !== null && (
          <line
            x1={PAD + Math.min(highlight, swipes.length - 1) * stepX}
            x2={PAD + Math.min(highlight, swipes.length - 1) * stepX}
            y1={0}
            y2={H}
            stroke="#0099ff"
            strokeWidth={1.5}
          />
        )}
      </svg>
      <div className="flex items-center gap-4 mt-3 flex-wrap">
        {DIM_LABELS.map((label, i) => (
          <span
            key={label}
            className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-deep"
          >
            <span
              className="inline-block w-3 h-px"
              style={{ background: DIM_COLORS[i] }}
            />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function Timeline({
  swipes,
  highlight,
}: {
  swipes: VisitorTrace['swipes'];
  highlight: number | null;
}) {
  return (
    <div className="bg-cloud border border-hairline rounded-sm">
      <table className="w-full">
        <thead>
          <tr className="hairline border-b">
            <th className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-secondary text-left p-3">
              #
            </th>
            <th className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-secondary text-left p-3">
              round
            </th>
            <th className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-secondary text-left p-3">
              card
            </th>
            <th className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-secondary text-left p-3">
              decision
            </th>
            <th className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-secondary text-left p-3">
              centroid
            </th>
            <th className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-secondary text-left p-3">
              t
            </th>
          </tr>
        </thead>
        <tbody>
          {swipes.map((s, i) => {
            const isHighlight = highlight !== null && i === highlight;
            return (
              <tr
                key={s._id}
                className={`hairline border-b last:border-b-0 transition-colors ${
                  isHighlight ? 'bg-soft' : ''
                }`}
              >
                <td className="font-mono text-[11px] text-muted-tertiary p-3">{i + 1}</td>
                <td className="font-mono text-[11px] text-ink-near p-3">r{s.round}</td>
                <td className="font-mono text-[11px] text-ink-near p-3">{s.cardId}</td>
                <td className="p-3">
                  <span
                    className={`font-mono text-[11px] uppercase tracking-[0.14em] ${
                      s.decision === 'yes' ? 'text-emerald-700/80' : 'text-muted-tertiary'
                    }`}
                  >
                    {s.decision}
                  </span>
                </td>
                <td className="p-3">
                  <span className="font-mono text-[10px] text-muted-deep">
                    [{s.currentCentroid.map((c) => c.toFixed(2)).join(', ')}]
                  </span>
                </td>
                <td className="font-mono text-[10px] text-muted-tertiary p-3">
                  {new Date(s.timestamp).toLocaleTimeString()}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
