/**
 * convex.ts — web-side bridge to the convex realtime spine.
 *
 * server-side only (next.js api routes). uses the http client because we
 * never need realtime subscriptions in api routes — that's the renderer's
 * job (see admin-live.ts for the useQuery path).
 *
 * fire-and-forget by design: every helper here MUST NOT block the user
 * response. wrap in `void` or `.catch(() => {})` at the call site.
 */

import { ConvexHttpClient } from 'convex/browser';

let cached: ConvexHttpClient | null | undefined;

export function getConvex(): ConvexHttpClient | null {
  if (cached !== undefined) return cached;
  const url = process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    cached = null;
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn('[convex] CONVEX_URL unset — bridge in no-op mode.');
    }
    return null;
  }
  cached = new ConvexHttpClient(url);
  return cached;
}

async function safeMutation(
  name: string,
  args: Record<string, unknown>,
): Promise<void> {
  const c = getConvex();
  if (!c) return;
  try {
    await c.mutation(name as never, args as never);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[convex] mutation ${name} failed`, err);
  }
}

// ──────────────────────────────────────────────────────────────────────────
// onboarding — called from /api/embed and /api/claim
// ──────────────────────────────────────────────────────────────────────────

export interface OnboardingMirrorInput {
  userId: string;
  name?: string;
  email?: string;
  vector: number[];
  traits: {
    aesthetic: string;
    disposition: string;
    style: string;
    voice_cluster: number;
  };
  archetypeHistory?: Array<{ round: number; archetypeId: string; timestamp: number }>;
  paletteHex?: string;
  vrmId?: string;
  numericTraits?: unknown;
  voiceConfig?: unknown;
  personalityMd?: string;
  phoneNumber?: string;
}

export async function saveOnboarding(input: OnboardingMirrorInput): Promise<void> {
  await safeMutation('users:saveOnboarding', input as unknown as Record<string, unknown>);
}

/** small helper for /api routes to record an unauthenticated heartbeat. */
export async function recordHeartbeat(note?: string): Promise<void> {
  await safeMutation('agentState:recordHeartbeat', { source: 'web', note });
}
