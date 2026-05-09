/**
 * lib/personaApply.ts — persona-driven side effects beyond what
 * `useAngelStore.applyClaim` already covers.
 *
 * Renderer-buildout's applyClaim already handles:
 *   - resolving claim → PersonaState
 *   - applying paletteHex to document CSS via applyPaletteToDocument
 *   - storing persona in useAngelStore.persona
 *
 * This file owns the additive bits the conversational layer cares about:
 *
 *   1. Set window.title to "Angel · {name}"
 *   2. Swap animalese voice bank to V{traits.voice_cluster}  (deferred —
 *      animalese is overlap territory; we register a swap-hook the renderer
 *      plan calls when its bank loader is wired)
 *   3. Schedule a `bg:autonomy` boot greeting +2s after persona apply
 *      (delivers the always-on-agents demo beat without user input)
 *   4. Provide DISPOSITION_PLACEHOLDERS lookup for ChatInput placeholder copy
 *
 * Usage: `bindPersonaApply()` once at App-level. Subscribes to the
 * useAngelStore.persona slice — fires on every persona change (including
 * the boot claim already wired by App.tsx). Idempotent.
 *
 * Spec: docs/conversational-agent-layer plan, "persona application cascade".
 */

import type { ClaimTokenPayload, PersonaTraits } from '@angel/shared';
import { useAngelStore } from '../stores/angel';
import { emitBgAutonomy } from './ipcEvents';

/* ------------------------------------------------------------------ */
/* hooks for downstream consumers (registered at App level)            */
/* ------------------------------------------------------------------ */

type VoiceCluster = 1 | 2 | 3 | 4 | 5 | 6;
type VoiceBankLoader = (cluster: VoiceCluster) => Promise<void> | void;

let _voiceBankLoader: VoiceBankLoader = async () => {};

/** Wire the animalese voice-bank loader at App level once player exists. */
export function registerVoiceBankLoader(fn: VoiceBankLoader): void {
  _voiceBankLoader = fn;
}

/* ------------------------------------------------------------------ */
/* placeholder copy by disposition (consumed by ChatInput)             */
/* ------------------------------------------------------------------ */

export const DISPOSITION_PLACEHOLDERS: Record<'B1' | 'B2' | 'B3' | 'B4', readonly string[]> = {
  B1: [
    "tell me what's on your mind…",
    'how can i help?',
    'what should we do today?',
  ],
  B2: [
    'what are we doing?',
    'gimme something to work on.',
    "let's go.",
  ],
  B3: [
    'whisper an idea…',
    'what are you dreaming about?',
    'where to next?',
  ],
  B4: [
    'task?',
    'what do you need?',
    'next move.',
  ],
} as const;

/** Pick a placeholder string for the given persona, rotating by minute. */
export function getPlaceholder(traits: PersonaTraits | null | undefined): string {
  if (!traits) return 'say something…';
  const arr = DISPOSITION_PLACEHOLDERS[traits.disposition] ?? DISPOSITION_PLACEHOLDERS.B1;
  const idx = Math.floor(Date.now() / 60_000) % arr.length;
  return arr[idx] ?? arr[0]!;
}

/* ------------------------------------------------------------------ */
/* persona-applied side effects                                        */
/* ------------------------------------------------------------------ */

let _appliedUserId: string | null = null;
let _bootGreetingTimer: ReturnType<typeof setTimeout> | null = null;

export interface PersonaApplyOptions {
  /** delay before firing bg:autonomy boot greeting. defaults 2000. 0 = skip. */
  bootGreetingDelayMs?: number;
  /** mock data for boot greeting "while you were away, X commits..." */
  bootCommits?: number;
  bootRepos?: string[];
}

async function applyAdditiveSideEffects(
  payload: { userId: string; name: string; traits: PersonaTraits },
  opts: PersonaApplyOptions,
): Promise<void> {
  const sameUser = _appliedUserId === payload.userId;

  if (!sameUser) {
    if (typeof document !== 'undefined' && payload.name) {
      document.title = `Angel · ${payload.name}`;
    }
    try {
      await _voiceBankLoader(payload.traits.voice_cluster);
    } catch (err) {
      console.warn('[personaApply] voice bank loader threw:', err);
    }
    _appliedUserId = payload.userId;
  }

  // schedule bg:autonomy boot greeting (resets on every persona change)
  if (_bootGreetingTimer) clearTimeout(_bootGreetingTimer);
  const delay = opts.bootGreetingDelayMs ?? 2000;
  if (delay > 0) {
    _bootGreetingTimer = setTimeout(() => {
      emitBgAutonomy({
        kind: 'while_you_were_away',
        payload: {
          commits: opts.bootCommits ?? 3,
          repos: opts.bootRepos ?? ['portfolio'],
          name: payload.name,
        },
      });
    }, delay);
  }
}

/* ------------------------------------------------------------------ */
/* App-level wiring                                                    */
/* ------------------------------------------------------------------ */

let _bound = false;
let _unsub: (() => void) | null = null;

/**
 * Subscribe to useAngelStore.persona changes. Fires applyAdditiveSideEffects
 * each time persona transitions to a non-null value. Idempotent.
 *
 * Returns an unsubscribe (rare to call — typically lives for app lifetime).
 */
export function bindPersonaApply(opts: PersonaApplyOptions = {}): () => void {
  if (_bound) return () => {};
  _bound = true;

  const fireFor = (persona: ReturnType<typeof useAngelStore.getState>['persona']) => {
    if (!persona) return;
    void applyAdditiveSideEffects(
      { userId: persona.userId, name: persona.name, traits: persona.traits },
      opts,
    );
  };

  // run once for current persona (in case it's already loaded)
  fireFor(useAngelStore.getState().persona);

  // subscribeWithSelector middleware on useAngelStore lets us watch the slice
  _unsub = useAngelStore.subscribe(
    (s) => s.persona,
    (persona, prev) => {
      if (prev?.userId === persona?.userId) return; // same user, skip
      fireFor(persona);
    },
  );

  return () => {
    if (!_bound) return;
    _bound = false;
    _unsub?.();
    _unsub = null;
    if (_bootGreetingTimer) {
      clearTimeout(_bootGreetingTimer);
      _bootGreetingTimer = null;
    }
  };
}

/* ------------------------------------------------------------------ */
/* manual entry — for tests or direct app integration                  */
/* ------------------------------------------------------------------ */

/** Manually invoke the cascade (e.g., when bypassing useAngelStore). */
export async function applyPersonaManual(
  claim: ClaimTokenPayload,
  opts: PersonaApplyOptions = {},
): Promise<void> {
  // sync into useAngelStore (in case caller didn't already)
  try {
    useAngelStore.getState().applyClaim(claim);
  } catch (err) {
    console.warn('[personaApply] applyClaim threw:', err);
  }
  await applyAdditiveSideEffects(
    { userId: claim.userId, name: claim.name, traits: claim.traits },
    opts,
  );
}
