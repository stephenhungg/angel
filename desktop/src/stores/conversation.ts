/**
 * stores/conversation.ts — L2 (conversational layer) state, complementary
 * to `stores/angel.ts` (renderer-buildout's scene/persona/chat queue store).
 *
 * Concern split (zero overlap):
 *   useAngelStore  → persona, chat history, bubble, scene action queue,
 *                    current animation clip, agent live state (mood/energy/
 *                    trust/emotion/location/isWalking).
 *   useConversationStore → turn FSM phase, input draft text, voice/mic state,
 *                          task stream (codex stdout for desk monitor),
 *                          interrupt coordination.
 *
 * Components subscribe to whichever store owns the data they need. The two
 * stores never duplicate fields. submitTurn is a thin orchestrator that
 * touches both: it appends a user message to useAngelStore.chat AND drives
 * our FSM forward.
 *
 * Spec: docs/conversational-agent-layer plan, "state store (zustand) — shape".
 */

import { create } from 'zustand';
import type { AngelTask } from '@angel/shared';
import { nextPhase } from '../lib/turnFsm';
import type { Phase, FsmEvent } from '../lib/turnFsm';
import { useAngelStore } from './angel';

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function genId(prefix = 't'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

/* ------------------------------------------------------------------ */
/* store interface                                                     */
/* ------------------------------------------------------------------ */

export interface ConversationStore {
  /* turn FSM */
  phase: Phase;
  currentTurnId: string | null;
  thinkingStartedAt: number | null;
  /** dispatch an FSM event — silently no-ops if invalid in current phase */
  transition: (event: FsmEvent) => Phase;
  setPhase: (phase: Phase) => void;

  /* input draft (controlled <input>) */
  inputDraft: string;
  setInputDraft: (text: string) => void;

  /* voice / push-to-talk */
  micActive: boolean;
  voiceTranscriptPartial: string;
  setMicActive: (active: boolean) => void;
  setVoiceTranscriptPartial: (text: string) => void;

  /* task stream — codex stdout pipeline for desk monitor */
  currentTask: AngelTask | null;
  taskLog: string[];
  setTask: (task: AngelTask | null) => void;
  appendTaskLog: (line: string) => void;
  clearTaskLog: () => void;

  /* interrupt */
  interruptReason: string | null;
  fireInterrupt: (reason: string) => void;

  /* turn dispatch — appends user message to useAngelStore.chat AND
   * drives our FSM. Returns the generated turnId. */
  submitTurn: (text: string) => string;
}

/* ------------------------------------------------------------------ */
/* implementation                                                      */
/* ------------------------------------------------------------------ */

export const useConversationStore = create<ConversationStore>((set, get) => ({
  /* fsm */
  phase: 'idle',
  currentTurnId: null,
  thinkingStartedAt: null,

  transition: (event) => {
    const cur = get().phase;
    const next = nextPhase(cur, event);
    if (!next || next === cur) return cur;

    const patch: Partial<ConversationStore> = { phase: next };
    if (next === 'thinking') patch.thinkingStartedAt = Date.now();
    if (next === 'idle') {
      patch.thinkingStartedAt = null;
      patch.currentTurnId = null;
      patch.interruptReason = null;
    }
    set(patch);
    return next;
  },

  setPhase: (phase) => set({ phase }),

  /* input draft */
  inputDraft: '',
  setInputDraft: (text) => set({ inputDraft: text }),

  /* voice */
  micActive: false,
  voiceTranscriptPartial: '',
  setMicActive: (active) => set({ micActive: active, voiceTranscriptPartial: active ? '' : get().voiceTranscriptPartial }),
  setVoiceTranscriptPartial: (text) => set({ voiceTranscriptPartial: text }),

  /* task stream */
  currentTask: null,
  taskLog: [],
  setTask: (task) =>
    set({
      currentTask: task,
      taskLog: task && task.status === 'running' ? [] : get().taskLog,
    }),
  appendTaskLog: (line) => set((s) => ({ taskLog: [...s.taskLog.slice(-199), line] })),
  clearTaskLog: () => set({ taskLog: [] }),

  /* interrupt */
  interruptReason: null,
  fireInterrupt: (reason) => {
    set({ interruptReason: reason });
    get().transition('interrupt_fired');

    // clear renderer-side scene queue + bubble through useAngelStore api
    try {
      useAngelStore.getState().cancelQueue();
      useAngelStore.getState().clearBubble?.();
    } catch (err) {
      console.warn('[conversation] interrupt cleanup threw:', err);
    }

    // brief delay before reset → idle so UI gets a frame to fade
    setTimeout(() => get().transition('reset'), 120);
  },

  /* turn dispatch */
  submitTurn: (text) => {
    const trimmed = text.trim();
    if (!trimmed) return '';

    const turnId = genId('turn');

    // 1. push user message into useAngelStore.chat (renderer's chat history)
    try {
      useAngelStore.getState().appendChat({
        id: turnId,
        role: 'user',
        text: trimmed,
        done: true,
      });
    } catch (err) {
      console.warn('[conversation] appendChat failed:', err);
    }

    // 2. clear our input draft, set turn id
    set({ inputDraft: '', currentTurnId: turnId });

    // 3. step FSM: any → submitting → thinking
    get().transition('submit'); // → submitting (or thinking if currently speaking)
    get().transition('submit'); // submitting → thinking

    // 4. dispatch to main process. fire-and-forget — events stream back.
    if (typeof window !== 'undefined' && window.angel) {
      try {
        void window.angel.invokeTool('chat', { text: trimmed, turnId });
      } catch (err) {
        console.warn('[conversation] chat invoke failed:', err);
        get().transition('interrupt_fired');
        get().transition('reset');
      }
    }

    return turnId;
  },
}));

/* ------------------------------------------------------------------ */
/* selectors                                                           */
/* ------------------------------------------------------------------ */

export const selectPhase = (s: ConversationStore) => s.phase;
export const selectInputDraft = (s: ConversationStore) => s.inputDraft;
export const selectMicActive = (s: ConversationStore) => s.micActive;
export const selectVoiceTranscriptPartial = (s: ConversationStore) => s.voiceTranscriptPartial;
export const selectTaskLog = (s: ConversationStore) => s.taskLog;
export const selectCurrentTask = (s: ConversationStore) => s.currentTask;
