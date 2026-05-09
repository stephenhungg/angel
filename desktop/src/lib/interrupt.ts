/**
 * lib/interrupt.ts — central cancellation coordinator.
 *
 * Triggered by:
 *   - Esc keypress (anywhere)
 *   - explicit "stop" button
 *   - new chat input arriving while still speaking (caller's choice)
 *
 * Effects (in order):
 *   1. fade animalese audio over ~100ms (animalese player's stop method)
 *   2. clear renderer scene queue + drop currentAction (useAngelStore.cancelQueue)
 *   3. clear speech bubble (useAngelStore.clearBubble)
 *   4. transition our FSM to interrupted then idle (useConversationStore.fireInterrupt)
 *   5. ipc.invokeTool('interrupt') → main aborts orchestrator + codex
 *   6. enqueue idle clip + face_user so the avatar settles visibly
 *
 * Animalese stop (1) is dependency-injected because animalese.ts is overlap
 * territory with the renderer-buildout plan. The stopper is wired at App
 * level once both files exist.
 *
 * Spec: docs/conversational-agent-layer plan, "interrupt + cancellation".
 */

import { useAngelStore } from '../stores/angel';
import { useConversationStore } from '../stores/conversation';
import type { SceneAction } from '@angel/shared';

/* ------------------------------------------------------------------ */
/* dependency injection                                                */
/* ------------------------------------------------------------------ */

type AnimaleseStopper = () => Promise<void> | void;

let _audioStopper: AnimaleseStopper = () => {};

/** Wire the audio stopper at App-level once animalese instance exists. */
export function registerAudioStopper(fn: AnimaleseStopper): void {
  _audioStopper = fn;
}

/* ------------------------------------------------------------------ */
/* fire                                                                */
/* ------------------------------------------------------------------ */

export type InterruptReason = 'user_esc' | 'user_button' | 'timeout' | 'new_input';

let _firing = false;

/**
 * Fire an interrupt. Idempotent — concurrent calls coalesce.
 */
export async function fireInterrupt(reason: InterruptReason = 'user_esc'): Promise<void> {
  if (_firing) return;
  _firing = true;
  try {
    // 1. fade audio first so the user *immediately* hears the stop
    try {
      await _audioStopper();
    } catch (err) {
      console.warn('[interrupt] audio stopper threw:', err);
    }

    // 2 + 3 + 4: clear renderer scene state + transition our FSM
    useConversationStore.getState().fireInterrupt(reason);

    // ensure the renderer side honors the cancel even if cancel_queue
    // SceneAction wasn't already dispatched
    try {
      useAngelStore.getState().cancelQueue();
      useAngelStore.getState().clearBubble?.();
    } catch (err) {
      console.warn('[interrupt] renderer cleanup threw:', err);
    }

    // 6. queue idle + face-user so the avatar visibly settles
    const idleAction: SceneAction = {
      id: `int_idle_${Date.now().toString(36)}`,
      type: 'play_clip',
      clip: 'idle',
      loop: false,
    };
    const faceUser: SceneAction = {
      id: `int_face_${Date.now().toString(36)}`,
      type: 'face',
      target: 'user',
    };
    try {
      useAngelStore.getState().enqueue([idleAction, faceUser]);
    } catch (err) {
      console.warn('[interrupt] enqueue settle actions threw:', err);
    }

    // 5. tell main to abort orchestrator generation. Existing main.ts doesn't
    // implement an 'interrupt' tool yet — Stephen wires this at 3:30pm. Until
    // then this just no-ops gracefully.
    if (typeof window !== 'undefined' && window.angel) {
      try {
        await window.angel.invokeTool('interrupt', { reason });
      } catch {
        /* not implemented — best-effort */
      }
    }
  } finally {
    setTimeout(() => {
      _firing = false;
    }, 150);
  }
}

/* ------------------------------------------------------------------ */
/* keyboard binding helper                                             */
/* ------------------------------------------------------------------ */

/**
 * Bind global Esc key to fireInterrupt. Returns an unsubscribe.
 * Called once at App-level.
 */
export function bindEscKey(): () => void {
  const handler = (ev: KeyboardEvent) => {
    if (ev.key !== 'Escape') return;
    if (ev.isComposing || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    void fireInterrupt('user_esc');
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}
