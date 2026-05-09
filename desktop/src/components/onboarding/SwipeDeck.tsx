/**
 * SwipeDeck — orchestrates the 3-round swipe flow.
 *
 * Reads from useSwipeStore. Drives round transitions + interstitials. On
 * flow-complete (round 3 finished), bumps store.phase from 'swipe' → 'reveal'
 * — the parent (Onboarding) renders the right screen for each phase.
 *
 * Ported from web/components/SwipeDeck.tsx — removed router.push (we use
 * store-driven phases, not routes) and styled with inline rules to match the
 * desktop HUD pattern.
 */

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import type { LibraryEntry } from '@angel/shared';
import { useSwipeStore } from '@/lib/swipeStore';
import { SwipeCard } from './SwipeCard';
import { Interstitial } from './Interstitial';
import { playChime, playVoiceTease } from '@/lib/swipeAudio';

export function SwipeDeck() {
  const { round, cards, cursor, swipe, advanceRound, init, setPhase } = useSwipeStore();
  const [phase, setLocalPhase] = useState<'cards' | 'interstitial' | 'gone'>('cards');

  useEffect(() => {
    init();
  }, [init]);

  function handleSwipe(decision: 'yes' | 'no') {
    if (decision === 'yes') {
      const card = cards[cursor];
      if (card) playChime(card);
    }
    const result = swipe(decision);
    if (result === 'round-complete') {
      setLocalPhase('interstitial');
    } else if (result === 'flow-complete') {
      setLocalPhase('gone');
      // brief beat then jump to the reveal screen (store-driven)
      window.setTimeout(() => setPhase('reveal'), 400);
    }
  }

  function handleInterstitialComplete() {
    advanceRound();
    setLocalPhase('cards');
  }

  function handleHover(entry: LibraryEntry) {
    playVoiceTease(entry);
  }

  // visible stack: top card + 2 behind for depth
  const stack = cards.slice(cursor, cursor + 3);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: 420,
        aspectRatio: '3 / 4',
        margin: '0 auto',
      }}
    >
      <AnimatePresence mode="wait">
        {phase === 'cards' && cards.length > 0 && (
          <motion.div
            key={`r${round}-c${cursor}`}
            style={{ position: 'absolute', inset: 0 }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          >
            {stack.map((entry, idx) => (
              <SwipeCard
                key={entry.id}
                entry={entry}
                onSwipe={handleSwipe}
                onHover={handleHover}
                isTop={idx === 0}
                zIndex={10 - idx}
              />
            ))}
          </motion.div>
        )}

        {phase === 'interstitial' && (
          <Interstitial round={round} onComplete={handleInterstitialComplete} />
        )}

        {phase === 'gone' && (
          <motion.div
            key="gone"
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 40,
                color: 'var(--angel-fg)',
                textShadow: '0 0 24px var(--angel-accent-soft)',
              }}
            >
              she's deciding…
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
