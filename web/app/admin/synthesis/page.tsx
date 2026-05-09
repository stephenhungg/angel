'use client';

import { useMemo, useState, useTransition } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSynthesisLog, type SynthesisRecord } from '@/lib/admin-live';

/**
 * /admin/synthesis — personality.md generation log.
 *
 * left: chronological list of generations (newest first), with model + version
 * + latency.
 * right: full record — input signals, meta-prompt, output, and two power
 * actions: rerun (re-feed inputs to verify stability) and prompt-version diff
 * (compare outputs across meta-prompt versions for the same inputs).
 */

export default function SynthesisPage() {
  const records = useSynthesisLog();
  const [selectedId, setSelectedId] = useState<string | null>(records[0]?._id ?? null);
  const [filterVersion, setFilterVersion] = useState<'all' | 'v1' | 'v2'>('all');

  const filtered = useMemo(() => {
    return records.filter(
      (r) => filterVersion === 'all' || r.metaPromptVersion === filterVersion,
    );
  }, [records, filterVersion]);

  const selected = filtered.find((r) => r._id === selectedId) ?? filtered[0] ?? null;

  return (
    <div className="grid grid-cols-1 tablet:grid-cols-[320px_1fr] min-h-[calc(100vh-72px)]">
      {/* list */}
      <aside className="hairline border-r overflow-y-auto max-h-[calc(100vh-72px)]">
        <div className="gutter py-6 sticky top-0 bg-paper hairline border-b z-10">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-secondary">
            generations
          </span>
          <h1 className="font-display italic text-[28px] text-ink-primary leading-none mt-1">
            synthesis
          </h1>

          <div className="flex items-center gap-2 mt-4">
            {(['all', 'v1', 'v2'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setFilterVersion(v)}
                className={`font-mono text-[10px] uppercase tracking-[0.14em] px-2.5 py-1 border ${
                  filterVersion === v
                    ? 'border-ink-primary bg-ink-primary text-cloud'
                    : 'border-hairline text-muted-deep hover:border-ink-near'
                } transition-colors`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
        <ul>
          {filtered.map((r) => {
            const active = r._id === selected?._id;
            return (
              <li key={r._id}>
                <button
                  onClick={() => setSelectedId(r._id)}
                  className={`w-full text-left gutter py-3 hairline border-b transition-colors ${
                    active ? 'bg-soft/60' : 'hover:bg-soft/40'
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-display italic text-[18px] text-ink-primary leading-none">
                      {r.userId}
                    </span>
                    <span
                      className={`font-mono text-[10px] uppercase tracking-[0.14em] ${
                        r.metaPromptVersion === 'v2' ? 'text-emerald-700/80' : 'text-muted-tertiary'
                      }`}
                    >
                      {r.metaPromptVersion}
                    </span>
                  </div>
                  <div className="font-mono text-[10px] text-muted-deep mt-1 flex items-center gap-3">
                    <span>{r.model}</span>
                    <span>·</span>
                    <span>{r.latencyMs}ms</span>
                    <span>·</span>
                    <span>t={r.temperature}</span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* detail */}
      <main className="overflow-y-auto max-h-[calc(100vh-72px)]">
        <AnimatePresence mode="wait">
          {selected && (
            <motion.div
              key={selected._id}
              initial={{ opacity: 0.001, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0.001 }}
              transition={{ duration: 0.4, ease: [0, 0, 0, 1] }}
              className="gutter py-10 flex flex-col gap-10"
            >
              <SynthesisDetail record={selected} allRecords={records} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────

function SynthesisDetail({
  record,
  allRecords,
}: {
  record: SynthesisRecord;
  allRecords: SynthesisRecord[];
}) {
  const [rerunResult, setRerunResult] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [showDiff, setShowDiff] = useState(false);

  // for the diff: find a record with the SAME userId but the OTHER prompt
  // version. (works for the mock; in prod we'd query by inputSignals hash.)
  const counterpart = useMemo(
    () =>
      allRecords.find(
        (r) =>
          r.userId === record.userId && r.metaPromptVersion !== record.metaPromptVersion,
      ) ?? null,
    [allRecords, record],
  );

  function rerun() {
    setRerunResult(null);
    start(async () => {
      // simulate a stable-ish rerun: 80% identical, 20% small drift.
      await new Promise((r) => setTimeout(r, 800 + Math.random() * 400));
      // mock determinism: identical output unless temperature > 0.5.
      const drift =
        record.temperature > 0.5
          ? record.outputMarkdown.replace('honesty over impressiveness.', 'honesty > impressiveness.')
          : record.outputMarkdown;
      setRerunResult(drift);
    });
  }

  return (
    <>
      <div className="flex items-end justify-between flex-wrap gap-6">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-secondary">
            personality.md
          </span>
          <h2 className="font-display italic text-[56px] text-ink-primary leading-none">
            {record.userId}
          </h2>
          <span className="font-mono text-[11px] text-muted-deep mt-1">
            {new Date(record.timestamp).toLocaleString()} · {record.metaPromptVersion} ·{' '}
            {record.model} · t={record.temperature} · {record.latencyMs}ms
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={rerun}
            disabled={pending}
            className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-primary border border-ink-primary px-4 py-2 hover:bg-ink-primary hover:text-cloud transition-colors disabled:opacity-40"
          >
            {pending ? 'running…' : 'rerun'}
          </button>
          {counterpart && (
            <button
              onClick={() => setShowDiff((v) => !v)}
              className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-primary border border-hairline px-4 py-2 hover:border-ink-near transition-colors"
            >
              {showDiff ? 'hide diff' : 'prompt diff'}
            </button>
          )}
        </div>
      </div>

      {/* input signals */}
      <section className="flex flex-col gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-secondary">
          input signals
        </span>
        <div className="grid grid-cols-1 tablet:grid-cols-2 gap-4">
          <div className="bg-cloud border border-hairline rounded-sm p-4 flex flex-col gap-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-deep">
              vector + macro + voice
            </span>
            <div className="flex flex-col gap-2">
              <Pair label="macro" value={record.inputSignals.macro} />
              <Pair label="voice" value={`cluster ${record.inputSignals.voiceCluster}`} />
              <Pair
                label="vector"
                value={
                  '[' +
                  record.inputSignals.vector.map((n) => n.toFixed(2)).join(', ') +
                  ']'
                }
              />
            </div>
          </div>
          <div className="bg-cloud border border-hairline rounded-sm p-4 flex flex-col gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-deep">
              dialogue samples
            </span>
            <ul className="flex flex-col gap-1.5">
              {record.inputSignals.dialogueSamples.map((s, i) => (
                <li
                  key={i}
                  className="font-display italic text-[15px] text-ink-near leading-snug border-l-2 border-hairline pl-3"
                >
                  &ldquo;{s}&rdquo;
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* meta-prompt */}
      <section className="flex flex-col gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-secondary">
          meta-prompt ({record.metaPromptVersion})
        </span>
        <pre className="font-mono text-[12px] leading-relaxed text-ink-near bg-soft/60 p-4 rounded-sm whitespace-pre-wrap">
          {record.metaPromptText}
        </pre>
      </section>

      {/* output (and rerun side-by-side if present) */}
      <section className="flex flex-col gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-secondary">
          output {rerunResult && '· rerun comparison'}
        </span>
        <div
          className={`grid gap-4 ${
            rerunResult ? 'grid-cols-1 tablet:grid-cols-2' : 'grid-cols-1'
          }`}
        >
          <div className="flex flex-col gap-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-primary">
              original
            </span>
            <pre className="font-mono text-[12px] leading-relaxed text-ink-near bg-cloud border border-hairline p-4 rounded-sm whitespace-pre-wrap">
              {record.outputMarkdown}
            </pre>
          </div>
          {rerunResult && (
            <div className="flex flex-col gap-2">
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-emerald-700/80">
                rerun{' '}
                {rerunResult === record.outputMarkdown
                  ? '— identical (deterministic)'
                  : '— drift detected'}
              </span>
              <pre className="font-mono text-[12px] leading-relaxed text-ink-near bg-cloud border border-hairline p-4 rounded-sm whitespace-pre-wrap">
                {rerunResult}
              </pre>
            </div>
          )}
        </div>
      </section>

      {/* prompt-version diff */}
      {showDiff && counterpart && (
        <section className="flex flex-col gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-secondary">
            prompt-version diff — same inputs, different meta-prompts
          </span>
          <div className="grid grid-cols-1 tablet:grid-cols-2 gap-4">
            <DiffPane record={record} />
            <DiffPane record={counterpart} />
          </div>
        </section>
      )}
    </>
  );
}

function DiffPane({ record }: { record: SynthesisRecord }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-primary">
        {record.metaPromptVersion} · {record.latencyMs}ms
      </span>
      <pre className="font-mono text-[12px] leading-relaxed text-ink-near bg-cloud border border-hairline p-4 rounded-sm whitespace-pre-wrap min-h-[280px]">
        {record.outputMarkdown}
      </pre>
    </div>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-deep">
        {label}
      </span>
      <span className="font-mono text-[11px] text-ink-near">{value}</span>
    </div>
  );
}
