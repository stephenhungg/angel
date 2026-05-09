/**
 * observability.ts — server-side helpers for the swipe + synthesis APIs to
 * write into the convex append-only logs that power /admin/*.
 *
 * usage from any next.js api route or server action:
 *
 *   import { logSwipeEvent, logSynthesis, logOrchestratorTurn } from '@/lib/observability';
 *   await logSwipeEvent({ userId, round, cardId, decision, currentCentroid });
 *
 * setup note: when the convex client is wired up at @angel/convex, swap the
 * `getConvex()` helper to import from there. until then the helpers degrade
 * gracefully — they never throw, they just console.warn so the swipe flow is
 * never blocked by the observability layer.
 */

import type { Vec5 } from './pca';

// ──────────────────────────────────────────────────────────────────────────
// convex client (lazy, optional during scaffold phase)
// ──────────────────────────────────────────────────────────────────────────

type ConvexLike = {
  mutation: (name: string, args: Record<string, unknown>) => Promise<unknown>;
};

let cachedClient: ConvexLike | null | undefined;

async function getConvex(): Promise<ConvexLike | null> {
  if (cachedClient !== undefined) return cachedClient;

  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    cachedClient = null;
    return null;
  }

  try {
    // dynamic import so missing convex generated types never break server build
    const mod = await import('convex/browser').catch(() => null);
    if (!mod || typeof mod.ConvexHttpClient !== 'function') {
      cachedClient = null;
      return null;
    }
    cachedClient = new mod.ConvexHttpClient(url) as unknown as ConvexLike;
    return cachedClient;
  } catch {
    cachedClient = null;
    return null;
  }
}

async function safeMutation(name: string, args: Record<string, unknown>): Promise<void> {
  try {
    const c = await getConvex();
    if (!c) {
      // soft-degrade — visible in dev console, silent in prod.
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.warn(`[observability] convex not wired; would have logged ${name}`, args);
      }
      return;
    }
    await c.mutation(name, args);
  } catch (err) {
    // never block the user-facing flow on observability writes.
    // eslint-disable-next-line no-console
    console.warn(`[observability] ${name} failed`, err);
  }
}

// ──────────────────────────────────────────────────────────────────────────
// public api
// ──────────────────────────────────────────────────────────────────────────

export interface SwipeEventInput {
  userId: string;
  round: number;
  cardId: string;
  decision: 'yes' | 'no';
  currentCentroid: Vec5;
}

/** call from /api/swipe or the swipe server action — once per swipe. */
export async function logSwipeEvent(input: SwipeEventInput): Promise<void> {
  await safeMutation('observability:appendSwipeEvent', {
    ...input,
    timestamp: Date.now(),
  });
}

export interface TraitVectorTraceInput {
  userId: string;
  round: number;
  centroid: Vec5;
  distancesToMacros: { cute: number; pretty: number; hot: number };
  signalStrength: number;
}

/** call once per round (after the 4 swipes resolve), for sparkline data. */
export async function logTraitVectorTrace(input: TraitVectorTraceInput): Promise<void> {
  await safeMutation('observability:appendTraitVectorTrace', { ...input });
}

export interface SynthesisLogInput {
  userId: string;
  inputSignals: unknown; // structured: { vector, dialogueSamples, macro, voice }
  metaPromptVersion: string;
  metaPromptText?: string;
  outputMarkdown: string;
  model: string;
  temperature?: number;
  latencyMs: number;
}

/** wrap your personality.md generation call with this for free observability. */
export async function logSynthesis(input: SynthesisLogInput): Promise<void> {
  await safeMutation('observability:appendSynthesis', {
    ...input,
    timestamp: Date.now(),
  });
}

/**
 * convenience: time a synthesis call automatically. example:
 *
 *   const md = await timedSynthesis({ userId, inputSignals, ... }, async () => {
 *     return await openai.chat.completions.create(...);
 *   });
 */
export async function timedSynthesis<T extends { outputMarkdown: string }>(
  meta: Omit<SynthesisLogInput, 'outputMarkdown' | 'latencyMs'>,
  fn: () => Promise<T>,
): Promise<T> {
  const t0 = Date.now();
  const result = await fn();
  const latencyMs = Date.now() - t0;
  await logSynthesis({ ...meta, outputMarkdown: result.outputMarkdown, latencyMs });
  return result;
}

export interface OrchestratorTurnInput {
  userId: string;
  turnId: string;
  systemPromptFull: string;
  userInput: string;
  output: string;
  toolsCalled: unknown[];
  latencyMs: number;
}

/** orchestrator turns flow into /admin (future). */
export async function logOrchestratorTurn(input: OrchestratorTurnInput): Promise<void> {
  // hash the system prompt — no crypto dep, fnv-1a 32-bit is plenty for diffs.
  const systemPromptHash = fnv1a(input.systemPromptFull);
  await safeMutation('observability:appendOrchestratorTurn', {
    ...input,
    systemPromptHash,
    timestamp: Date.now(),
  });
}

function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
