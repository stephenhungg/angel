/**
 * lib/turnFsm.ts — conversational turn state machine.
 *
 * Phase transitions per the conversational-agent-layer plan:
 *
 *   idle ─→ listening ─→ submitting ─→ thinking ─→ filler ─→ speaking
 *                                              ╲          ╱
 *                                               ╲────────╱
 *                                                speaking
 *
 *   speaking <-> action_executing  (action emits mid-utterance)
 *   speaking ─→ idle               (turn done + actions drained)
 *   * ─→ interrupted ─→ idle       (escape valve)
 *
 * Pure module — no React, no zustand, no IPC. Consumed by stores/conversation.ts
 * which calls `nextPhase(currentPhase, event)` to compute the next state.
 */

export type Phase =
  | 'idle'
  | 'listening'
  | 'submitting'
  | 'thinking'
  | 'filler'
  | 'speaking'
  | 'action_executing'
  | 'interrupted';

export type FsmEvent =
  | 'focus_input'
  | 'mic_press'
  | 'mic_release'
  | 'submit'
  | 'thinking_timeout'
  | 'token_arrived'
  | 'action_arrived'
  | 'action_complete'
  | 'turn_done'
  | 'interrupt_fired'
  | 'reset';

/* ------------------------------------------------------------------ */
/* transition table                                                    */
/* ------------------------------------------------------------------ */

const TRANSITIONS: Record<Phase, Partial<Record<FsmEvent, Phase>>> = {
  idle: {
    focus_input: 'listening',
    mic_press: 'listening',
    submit: 'submitting',
    /** unprompted token (e.g., bg autonomy greeting) — go straight to speaking */
    token_arrived: 'speaking',
    /** unprompted action (e.g., bg autonomy walk-to-window) */
    action_arrived: 'action_executing',
    interrupt_fired: 'idle',
  },
  listening: {
    submit: 'submitting',
    mic_release: 'submitting',
    reset: 'idle',
    interrupt_fired: 'idle',
  },
  submitting: {
    submit: 'thinking',
    interrupt_fired: 'interrupted',
  },
  thinking: {
    thinking_timeout: 'filler',
    token_arrived: 'speaking',
    action_arrived: 'action_executing',
    interrupt_fired: 'interrupted',
  },
  filler: {
    token_arrived: 'speaking',
    action_arrived: 'action_executing',
    interrupt_fired: 'interrupted',
  },
  speaking: {
    action_arrived: 'action_executing',
    turn_done: 'idle',
    /** mid-speech the user can submit a new turn — go through submitting */
    submit: 'submitting',
    interrupt_fired: 'interrupted',
  },
  action_executing: {
    action_complete: 'speaking',
    turn_done: 'idle',
    token_arrived: 'speaking',
    interrupt_fired: 'interrupted',
  },
  interrupted: {
    reset: 'idle',
  },
};

/* ------------------------------------------------------------------ */
/* api                                                                 */
/* ------------------------------------------------------------------ */

/**
 * Compute next phase from `from` given `event`. Returns null if the event
 * is not valid in the current phase (caller decides whether to ignore or
 * raise — most consumers should ignore silently to keep the demo robust).
 */
export function nextPhase(from: Phase, event: FsmEvent): Phase | null {
  const map = TRANSITIONS[from];
  return map[event] ?? null;
}

/** True if user input is allowed (typing, mic). */
export function isInteractive(phase: Phase): boolean {
  return phase === 'idle' || phase === 'listening' || phase === 'speaking';
}

/** True if the UI should dim the avatar / lower ambient music while we wait. */
export function shouldDimUI(phase: Phase): boolean {
  return phase === 'thinking' || phase === 'filler';
}

/** True if a turn is in progress (anywhere from submitting to speaking). */
export function isInTurn(phase: Phase): boolean {
  return phase !== 'idle' && phase !== 'listening' && phase !== 'interrupted';
}

/** Filler engine should arm when entering this phase. */
export function shouldArmFiller(phase: Phase): boolean {
  return phase === 'thinking';
}

export const ALL_PHASES: readonly Phase[] = [
  'idle',
  'listening',
  'submitting',
  'thinking',
  'filler',
  'speaking',
  'action_executing',
  'interrupted',
] as const;
