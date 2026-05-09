/**
 * lib/filler.ts — perceived-latency mask.
 *
 * If the FSM sits in `thinking` for more than ~500ms (codex/claude is taking
 * its time), play a tiny pre-cached animalese filler clip — "hmm.", "uh.",
 * "wait.", "lemme think." — so the user *feels* like the avatar is alive
 * even before the real response token arrives.
 *
 * Crucially:
 *   - Never fire if response arrives in <500ms (otherwise feels random).
 *   - Crossfade out the filler the moment a real `chat:token` arrives.
 *   - Pick line per disposition archetype so it's persona-flavored.
 *
 * Animalese player is owned by the renderer-buildout plan. We accept it
 * via dependency injection (registerFillerSpeaker) so this file can ship
 * standalone, and the App-level wiring connects them after both files exist.
 *
 * Spec: docs/conversational-agent-layer plan, "filler / latency mask".
 */

import { useConversationStore } from '../stores/conversation';
import type { Phase } from './turnFsm';

/* ------------------------------------------------------------------ */
/* dependency injection                                                */
/* ------------------------------------------------------------------ */

/** A speaker fn returns a controller that can be stopped (with fade). */
export type FillerController = {
  stop(fadeMs?: number): Promise<void> | void;
};

export type FillerSpeaker = (text: string, opts?: { rate?: number }) => FillerController;

let _speaker: FillerSpeaker = () => ({ stop: () => {} });

/** Wire the animalese speaker at App level once the player exists. */
export function registerFillerSpeaker(fn: FillerSpeaker): void {
  _speaker = fn;
}

/* ------------------------------------------------------------------ */
/* line banks                                                          */
/* ------------------------------------------------------------------ */

const LINES_BY_DISPOSITION: Record<'B1' | 'B2' | 'B3' | 'B4', readonly string[]> = {
  B1: ['hmm.', 'lemme think.', 'one sec.', 'okay.'],
  B2: ['oof.', 'real quick.', 'one sec.', 'wait.'],
  B3: ['mmm.', 'hmm.', 'oh.', 'one moment.'],
  B4: ['thinking.', 'one sec.', 'standby.', 'processing.'],
};

function pickLine(): string {
  const state = useConversationStore.getState() as unknown as {
    persona?: { traits?: { disposition?: 'B1' | 'B2' | 'B3' | 'B4' } } | null;
  };
  const disposition = state.persona?.traits?.disposition ?? 'B1';
  const arr = LINES_BY_DISPOSITION[disposition] ?? LINES_BY_DISPOSITION.B1;
  return arr[Math.floor(Math.random() * arr.length)] ?? arr[0]!;
}

/* ------------------------------------------------------------------ */
/* engine                                                              */
/* ------------------------------------------------------------------ */

const FILLER_DELAY_MS = 500;
const FILLER_FADE_MS = 100;

let _started = false;
let _armTimer: ReturnType<typeof setTimeout> | null = null;
let _activeController: FillerController | null = null;
let _unsubStore: (() => void) | null = null;

function clearArmTimer(): void {
  if (_armTimer) clearTimeout(_armTimer);
  _armTimer = null;
}

async function stopActiveController(): Promise<void> {
  if (!_activeController) return;
  const ctrl = _activeController;
  _activeController = null;
  try {
    await ctrl.stop(FILLER_FADE_MS);
  } catch (err) {
    console.warn('[filler] stop threw:', err);
  }
}

function onPhaseChanged(phase: Phase): void {
  if (phase === 'thinking') {
    // arm — but don't fire yet
    clearArmTimer();
    _armTimer = setTimeout(() => {
      // double-check we're still in thinking; user might've interrupted
      const cur = useConversationStore.getState().phase;
      if (cur !== 'thinking') return;
      const line = pickLine();
      try {
        _activeController = _speaker(line, { rate: 1.0 });
        // also push the filler line into the FSM so the avatar lipsyncs etc.
        useConversationStore.getState().transition('thinking_timeout');
      } catch (err) {
        console.warn('[filler] speaker threw:', err);
      }
    }, FILLER_DELAY_MS);
  } else {
    // any non-thinking phase → cancel arm, stop active filler
    clearArmTimer();
    if (phase === 'speaking' || phase === 'idle' || phase === 'interrupted') {
      void stopActiveController();
    }
  }
}

/* ------------------------------------------------------------------ */
/* public api                                                           */
/* ------------------------------------------------------------------ */

/**
 * Start the filler engine. Subscribes to store phase changes. Idempotent.
 * Call once at App-level.
 */
export function startFillerEngine(): void {
  if (_started) return;
  _started = true;

  let lastPhase = useConversationStore.getState().phase;
  _unsubStore = useConversationStore.subscribe((s) => {
    if (s.phase === lastPhase) return;
    lastPhase = s.phase;
    onPhaseChanged(s.phase);
  });
}

export function stopFillerEngine(): void {
  if (!_started) return;
  _started = false;
  if (_unsubStore) _unsubStore();
  _unsubStore = null;
  clearArmTimer();
  void stopActiveController();
}
