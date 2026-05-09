/**
 * swipeStore.ts — zustand store for the 3-round swipe flow.
 *
 * Ported from web/lib/swipe-store.ts. Same state machine:
 *   intro → round 1 → interstitial → round 2 → interstitial → round 3 → reveal
 *
 * Persisted to localStorage so a refresh mid-flow resumes where you left off.
 * We also expose `phase` so the App-level switcher knows whether to render
 * the title, swipe, or reveal screen — the web app used routes for this; we
 * use a single store-driven phase instead.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LibraryEntry, NumericTraits, AestheticArchetype } from '@angel/shared';
import { centroidOf, composeRound, nearestArchetype } from './library';

type Decision = 'yes' | 'no';

export type OnboardingPhase = 'title' | 'swipe' | 'reveal' | 'done';

export interface SwipeRecord {
  round: 1 | 2 | 3;
  cardId: string;
  decision: Decision;
  ts: number;
}

interface SwipeState {
  /** which screen the renderer is showing right now */
  phase: OnboardingPhase;

  sessionId: string;
  round: 1 | 2 | 3;
  cards: LibraryEntry[];
  cursor: number;
  history: SwipeRecord[];
  yesPicks: LibraryEntry[];

  centroid: NumericTraits | null;
  archetype: AestheticArchetype | null;

  // actions
  setPhase: (phase: OnboardingPhase) => void;
  beginSwipe: () => void;
  init: () => void;
  swipe: (decision: Decision) => 'next-card' | 'round-complete' | 'flow-complete';
  advanceRound: () => void;
  reset: () => void;
}

function newSession(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

export const useSwipeStore = create<SwipeState>()(
  persist(
    (set, get) => ({
      phase: 'title',
      sessionId: '',
      round: 1,
      cards: [],
      cursor: 0,
      history: [],
      yesPicks: [],
      centroid: null,
      archetype: null,

      setPhase: (phase) => set({ phase }),

      beginSwipe: () => {
        // fresh session whenever the user clicks "discover your angel" —
        // the title button is a one-way door into a clean swipe flow
        get().reset();
        set({ phase: 'swipe' });
      },

      init: () => {
        const s = get();
        if (s.sessionId && s.cards.length > 0) return;
        const sid = newSession();
        const cards = composeRound(1, sid, null, new Set());
        set({
          sessionId: sid,
          round: 1,
          cards,
          cursor: 0,
          history: [],
          yesPicks: [],
          centroid: null,
          archetype: null,
        });
      },

      swipe: (decision) => {
        const s = get();
        const card = s.cards[s.cursor];
        if (!card) return 'next-card';

        const rec: SwipeRecord = {
          round: s.round,
          cardId: card.id,
          decision,
          ts: Date.now(),
        };
        const newHistory = [...s.history, rec];
        const newYes = decision === 'yes' ? [...s.yesPicks, card] : s.yesPicks;
        const nextCursor = s.cursor + 1;

        if (nextCursor < s.cards.length) {
          set({ history: newHistory, yesPicks: newYes, cursor: nextCursor });
          return 'next-card';
        }

        // round complete — recompute centroid + nearest archetype
        const cent = newYes.length > 0 ? centroidOf(newYes) : s.centroid;
        const arch = cent ? nearestArchetype(cent) : null;

        set({
          history: newHistory,
          yesPicks: newYes,
          cursor: nextCursor,
          centroid: cent,
          archetype: arch,
        });

        return s.round === 3 ? 'flow-complete' : 'round-complete';
      },

      advanceRound: () => {
        const s = get();
        if (s.round >= 3) return;
        const nextRound = (s.round + 1) as 2 | 3;
        const seen = new Set(s.history.map((h) => h.cardId));
        const cards = composeRound(nextRound, s.sessionId, s.centroid, seen);
        set({ round: nextRound, cards, cursor: 0 });
      },

      reset: () => {
        const sid = newSession();
        const cards = composeRound(1, sid, null, new Set());
        set({
          sessionId: sid,
          round: 1,
          cards,
          cursor: 0,
          history: [],
          yesPicks: [],
          centroid: null,
          archetype: null,
        });
      },
    }),
    {
      name: 'angel-swipe-state',
      partialize: (s) => ({
        phase: s.phase,
        sessionId: s.sessionId,
        round: s.round,
        history: s.history,
        yesPicks: s.yesPicks,
        centroid: s.centroid,
        archetype: s.archetype,
      }),
    },
  ),
);
