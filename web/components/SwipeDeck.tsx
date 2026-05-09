'use client';

/**
 * SwipeDeck — orchestrates the 3-round swipe flow.
 * Reads from useSwipeStore. Drives round transitions + interstitials.
 * On flow-complete, navigates to /reveal.
 */

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { LibraryEntry } from '@angel/shared';
import { useSwipeStore } from '@/lib/swipe-store';
import { SwipeCard } from './SwipeCard';
import { Interstitial } from './Interstitial';
import { HeartBurst } from './HeartBurst';
import { playChime, playVoiceTease } from '@/lib/audio';

export function SwipeDeck() {
  const router = useRouter();
  const { round, cards, cursor, swipe, advanceRound, init } = useSwipeStore();
  const [phase, setPhase] = useState<'cards' | 'interstitial' | 'gone'>('cards');
  const [burst, setBurst] = useState<{ key: number; x: number; y: number }>({
    key: 0,
    x: 0,
    y: 0,
  });

  useEffect(() => {
    init();
  }, [init]);

  function handleSwipe(decision: 'yes' | 'no', burstOrigin?: { x: number; y: number }) {
    if (decision === 'yes') {
      const card = cards[cursor];
      if (card) playChime(card);
      // fire heart burst at the card's center
      if (burstOrigin) {
        setBurst((b) => ({ key: b.key + 1, x: burstOrigin.x, y: burstOrigin.y }));
      }
    }
    const result = swipe(decision);
    if (result === 'round-complete') {
      setPhase('interstitial');
    } else if (result === 'flow-complete') {
      setPhase('gone');
      // brief beat then route to reveal
      setTimeout(() => router.push('/reveal'), 400);
    }
  }

  function handleInterstitialComplete() {
    advanceRound();
    setPhase('cards');
  }

  function handleHover(entry: LibraryEntry) {
    playVoiceTease(entry);
  }

  // visible stack: top card + 2 behind for depth
  const stack = cards.slice(cursor, cursor + 3);

  return (
    <div className="relative w-full max-w-[420px] aspect-[3/4] mx-auto">
      <AnimatePresence mode="wait">
        {phase === 'cards' && cards.length > 0 && (
          <motion.div
            key={`r${round}-c${cursor}`}
            className="absolute inset-0"
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
            className="absolute inset-0 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <div className="font-display italic text-[36px] text-ink-near">
              she&rsquo;s deciding…
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
