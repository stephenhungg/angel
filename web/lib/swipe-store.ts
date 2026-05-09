/**
 * swipe-store.ts — zustand store for the 3-round swipe flow.
 *
 * State machine: intro → round 1 → interstitial → round 2 → interstitial → round 3 → reveal
 * Each round: 4 cards, swipe right (yes) or left (no), min 1 yes to advance.
 */

'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LibraryEntry, NumericTraits, AestheticArchetype } from '@angel/shared';
import { centroidOf, composeRound, nearestArchetype, refreshDeckTail } from './library';

type Decision = 'yes' | 'no';

export interface SwipeRecord {
  round: 1 | 2 | 3;
  cardId: string;
  decision: Decision;
  ts: number;
}

interface SwipeState {
  sessionId: string;
  round: 1 | 2 | 3;
  cards: LibraryEntry[]; // 4 for current round
  cursor: number; // index within cards (0-3)
  history: SwipeRecord[];
  yesPicks: LibraryEntry[];

  // derived (computed on round end)
  centroid: NumericTraits | null;
  archetype: AestheticArchetype | null;

  // actions
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
      sessionId: '',
      round: 1,
      cards: [],
      cursor: 0,
      history: [],
      yesPicks: [],
      centroid: null,
      archetype: null,

      init: () => {
        const s = get();
        if (s.sessionId && s.cards.length > 0) return; // already inited
        const sid = newSession();
        const seen = new Set<string>();
        const cards = composeRound(1, sid, null, seen);
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
          // mid-round: if it was a yes, recompute the running centroid and
          // refresh the un-swiped tail of the deck so the next cards under
          // the user's finger drift toward what they just liked.
          let nextCards = s.cards;
          if (decision === 'yes' && newYes.length > 0) {
            const runningCentroid = centroidOf(newYes);
            const seen = new Set(newHistory.map((h) => h.cardId));
            nextCards = refreshDeckTail(s.cards, nextCursor, runningCentroid, seen);
          }
          set({
            history: newHistory,
            yesPicks: newYes,
            cursor: nextCursor,
            cards: nextCards,
          });
          return 'next-card';
        }

        // round complete
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
