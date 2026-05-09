/**
 * SwipeDeck — orchestrates the 3-round flow. Ported from web/components/SwipeDeck.tsx.
 * onComplete callback replaces next/navigation router.push('/reveal').
 */

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import type { LibraryEntry } from '@angel/shared';
import { useSwipeStore } from '@/stores/swipe';
import { SwipeCard } from './SwipeCard';
import { Interstitial } from './Interstitial';
import { playChime, playVoiceTease } from '@/lib/animalese';

interface SwipeDeckProps {
  onComplete: () => void;
}

export function SwipeDeck({ onComplete }: SwipeDeckProps) {
  const { round, cards, cursor, swipe, advanceRound, init } = useSwipeStore();
  const [phase, setPhase] = useState<'cards' | 'interstitial' | 'gone'>('cards');

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
      setPhase('interstitial');
    } else if (result === 'flow-complete') {
      setPhase('gone');
      setTimeout(() => onComplete(), 400);
    }
  }

  function handleInterstitialComplete() {
    advanceRound();
    setPhase('cards');
  }

  function handleHover(entry: LibraryEntry) {
    playVoiceTease(entry);
  }

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
