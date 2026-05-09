/**
 * admin-live.ts — adapter between the /admin pages and the live data source.
 *
 * primary path: convex `useQuery` subscriptions.
 * fallback path (current state — convex tables exist in schema.ts but not yet
 * deployed): a deterministic in-memory simulator that fakes ~30 demo-day
 * visitors swiping in real time so the dashboard renders + animates.
 *
 * when convex generated types land at `convex/_generated/api`, swap
 * `useLiveSwipeStream` and `useLiveTraces` to wrap `useQuery(api.observability.*)`.
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { MACROS, type Vec5 } from './pca';

// ──────────────────────────────────────────────────────────────────────────
// types — mirror the convex tables 1:1.
// ──────────────────────────────────────────────────────────────────────────

export interface SwipeEvent {
  _id: string;
  userId: string;
  round: number;
  cardId: string;
  decision: 'yes' | 'no';
  currentCentroid: Vec5;
  timestamp: number;
}

export interface VisitorTrace {
  userId: string;
  displayName: string; // anon-friendly handle
  startedAt: number;
  swipes: SwipeEvent[];
  centroid: Vec5;
  finalMacro: 'cute' | 'pretty' | 'hot' | null;
  voiceCluster: number | null;
  personalityMd: string | null;
}

export interface SynthesisRecord {
  _id: string;
  userId: string;
  inputSignals: {
    vector: Vec5;
    macro: 'cute' | 'pretty' | 'hot';
    voiceCluster: number;
    dialogueSamples: string[];
  };
  metaPromptVersion: string;
  metaPromptText: string;
  outputMarkdown: string;
  model: string;
  temperature: number;
  latencyMs: number;
  timestamp: number;
}

// ──────────────────────────────────────────────────────────────────────────
// deterministic prng — keeps the mock world identical across reloads.
// ──────────────────────────────────────────────────────────────────────────

function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s >>>= 0;
    s ^= s << 5;
    s >>>= 0;
    return (s & 0xffffffff) / 0xffffffff;
  };
}

const FIRSTS = [
  'maeve',
  'ines',
  'noor',
  'wren',
  'sora',
  'cleo',
  'iris',
  'juno',
  'thea',
  'lior',
  'rumi',
  'odette',
  'sage',
  'mika',
  'fern',
  'aine',
  'nova',
  'lila',
  'ezri',
  'ava',
  'piper',
  'sasha',
  'remy',
  'bea',
  'romi',
  'yael',
  'colette',
  'pearl',
  'milena',
  'anouk',
];

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function lerp5(a: Vec5, b: Vec5, t: number): Vec5 {
  return [
    clamp01(a[0] + (b[0] - a[0]) * t),
    clamp01(a[1] + (b[1] - a[1]) * t),
    clamp01(a[2] + (b[2] - a[2]) * t),
    clamp01(a[3] + (b[3] - a[3]) * t),
    clamp01(a[4] + (b[4] - a[4]) * t),
  ];
}

function dist5(a: Vec5, b: Vec5): number {
  let s = 0;
  for (let i = 0; i < 5; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
}

function nearestMacro(v: Vec5): 'cute' | 'pretty' | 'hot' {
  let best: 'cute' | 'pretty' | 'hot' = 'cute';
  let bestD = Infinity;
  for (const m of MACROS) {
    const d = dist5(v, m.vector);
    if (d < bestD) {
      bestD = d;
      best = m.id;
    }
  }
  return best;
}

// ──────────────────────────────────────────────────────────────────────────
// build a deterministic seed-set of ~30 visitors with full traces.
// ──────────────────────────────────────────────────────────────────────────

function generateVisitor(seed: number, baseTime: number): VisitorTrace {
  const rng = makeRng(seed * 2654435761);
  const targetMacro = MACROS[Math.floor(rng() * 3)];
  const startedAt = baseTime - Math.floor(rng() * 1000 * 60 * 30); // last 30min
  const userId = `visitor-${seed.toString().padStart(3, '0')}`;
  const displayName = `${FIRSTS[seed % FIRSTS.length]}.${(seed * 7) % 97}`;

  // each visitor does 3 rounds × 4 swipes = 12 swipes, drifting toward macro.
  let centroid: Vec5 = [0.5, 0.5, 0.5, 0.5, 0.5];
  const swipes: SwipeEvent[] = [];
  for (let r = 1; r <= 3; r++) {
    for (let i = 0; i < 4; i++) {
      const decision: 'yes' | 'no' = rng() < 0.55 ? 'yes' : 'no';
      const pull = decision === 'yes' ? 0.18 : -0.04;
      // jitter the target slightly per-card so the path is wiggly, not laser.
      const jitter: Vec5 = [
        (rng() - 0.5) * 0.2,
        (rng() - 0.5) * 0.2,
        (rng() - 0.5) * 0.2,
        (rng() - 0.5) * 0.2,
        (rng() - 0.5) * 0.2,
      ];
      const wobblyTarget = lerp5(targetMacro.vector, [
        clamp01(targetMacro.vector[0] + jitter[0]),
        clamp01(targetMacro.vector[1] + jitter[1]),
        clamp01(targetMacro.vector[2] + jitter[2]),
        clamp01(targetMacro.vector[3] + jitter[3]),
        clamp01(targetMacro.vector[4] + jitter[4]),
      ], 0.5);
      centroid = lerp5(centroid, wobblyTarget, pull);
      swipes.push({
        _id: `${userId}-${r}-${i}`,
        userId,
        round: r,
        cardId: `card-${(seed + i) % 30}`,
        decision,
        currentCentroid: centroid,
        timestamp: startedAt + (r - 1) * 30_000 + i * 6_000,
      });
    }
  }

  const finalMacro = nearestMacro(centroid);
  const voiceCluster = ((seed * 13) % 6) + 1;

  return {
    userId,
    displayName,
    startedAt,
    swipes,
    centroid,
    finalMacro,
    voiceCluster,
    personalityMd: samplePersonality({ macro: finalMacro, voice: voiceCluster, name: displayName }),
  };
}

function samplePersonality(args: { macro: string; voice: number; name: string }): string {
  return [
    `# personality — ${args.name}`,
    '',
    '## tone',
    args.macro === 'cute'
      ? '- soft-edged. comments lean affectionate, never sharp.'
      : args.macro === 'pretty'
        ? '- still and golden. unhurried. lets sentences breathe.'
        : '- vivid and decisive. opens with the verb.',
    '',
    '## tells',
    '- catches her own thought mid-sentence and rewrites it out loud.',
    `- voice cluster ${args.voice} — ${args.voice <= 2 ? 'low + warm' : args.voice <= 4 ? 'mid + bright' : 'higher + textured'}.`,
    '- prefers two short lines to one long one.',
    '',
    '## anchors',
    '- honesty over impressiveness.',
    "- if she doesn't know, she says she doesn't know.",
    '- when uncertain, picks the gentler read.',
    '',
    '## avoid',
    '- corporate softeners ("just to clarify", "I hope this helps").',
    '- ending on a question to hide a stance.',
  ].join('\n');
}

// stable seed-set, generated once per browser session.
function buildSeedWorld(): VisitorTrace[] {
  const now = Date.now();
  return Array.from({ length: 30 }, (_, i) => generateVisitor(i + 1, now));
}

// ──────────────────────────────────────────────────────────────────────────
// hook — useLiveVisitors. simulates new swipes drifting in.
// ──────────────────────────────────────────────────────────────────────────

/**
 * subscribe to the live visitor world.
 *
 * production path (post-convex-wire): replace the body with
 *   const events = useQuery(api.observability.recentSwipes, { since })
 *   ...reduce events into VisitorTrace[]
 *
 * for now: deterministic seed + a slow drift loop that bumps random visitors
 * one swipe at a time so the dashboard shows live motion.
 */
export function useLiveVisitors(): VisitorTrace[] {
  const [visitors, setVisitors] = useState<VisitorTrace[]>(() => buildSeedWorld());
  const tickRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const id = window.setInterval(() => {
      if (cancelled) return;
      setVisitors((prev) => {
        const i = tickRef.current % prev.length;
        tickRef.current++;
        const v = prev[i];
        // nudge centroid by a small random delta toward the visitor's macro.
        const macro = MACROS.find((m) => m.id === (v.finalMacro ?? 'cute'))!;
        const next = lerp5(v.centroid, macro.vector, 0.08);
        const updated: VisitorTrace = {
          ...v,
          centroid: next,
          swipes: [
            ...v.swipes,
            {
              _id: `${v.userId}-live-${v.swipes.length}`,
              userId: v.userId,
              round: 3,
              cardId: `card-live-${tickRef.current}`,
              decision: (tickRef.current % 3 === 0 ? 'no' : 'yes') as 'yes' | 'no',
              currentCentroid: next,
              timestamp: Date.now(),
            } satisfies SwipeEvent,
          ].slice(-24),
        };
        const out = prev.slice();
        out[i] = updated;
        return out;
      });
    }, 1100);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return visitors;
}

// ──────────────────────────────────────────────────────────────────────────
// synthesis log — deterministic mock until convex is live.
// ──────────────────────────────────────────────────────────────────────────

const PROMPT_V1 = `You are crafting personality.md for an angel.
Inputs: persona vector (5d), macro (cute|pretty|hot), voice cluster (1-6),
4 dialogue samples from her swipe path.
Output: tight markdown, four sections — tone, tells, anchors, avoid.
Voice anchors: honesty > impressiveness. discovery > prompting. her, not it.`;

const PROMPT_V2 = `You are crafting personality.md for an angel.
Inputs: persona vector (5d), macro (cute|pretty|hot), voice cluster (1-6),
4 dialogue samples from her swipe path.
Output: tight markdown — sections "tone" "tells" "anchors" "avoid", in lowercase.
Each bullet must be specific (no generic "be friendly"). Cut hedging.
Voice anchors: honesty > impressiveness. discovery > prompting. her, not it.`;

export function useSynthesisLog(): SynthesisRecord[] {
  const [records] = useState<SynthesisRecord[]>(() => {
    const world = buildSeedWorld();
    const now = Date.now();
    return world.slice(0, 14).map((v, i) => {
      const versionIsV2 = i % 3 !== 0;
      return {
        _id: `synth-${v.userId}`,
        userId: v.userId,
        inputSignals: {
          vector: v.centroid,
          macro: v.finalMacro ?? 'cute',
          voiceCluster: v.voiceCluster ?? 1,
          dialogueSamples: [
            "you don't have to push so hard right now.",
            "ok but — what would actually feel good?",
            'i kept thinking about that thing you said last week.',
            "want me to just start it? you can tell me to stop.",
          ],
        },
        metaPromptVersion: versionIsV2 ? 'v2' : 'v1',
        metaPromptText: versionIsV2 ? PROMPT_V2 : PROMPT_V1,
        outputMarkdown: v.personalityMd ?? '',
        model: 'claude-sonnet-4-6',
        temperature: 0.7,
        latencyMs: 1200 + ((i * 73) % 800),
        timestamp: now - i * 1000 * 60 * 4,
      };
    });
  });
  return records;
}
