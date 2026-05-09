'use client';

/**
 * /swipe — entry point for the 3-round onboarding.
 * Kawaii pink + ambient sparkles + miside-coded headers.
 */

import { motion } from 'framer-motion';
import { useSwipeStore } from '@/lib/swipe-store';
import { SwipeDeck } from '@/components/SwipeDeck';
import { SparkleField } from '@/components/SparkleField';

export default function SwipePage() {
  const round = useSwipeStore((s) => s.round);

  return (
    <main className="min-h-screen kawaii-bg text-ink-near flex flex-col relative overflow-hidden">
      {/* ambient sparkle layer */}
      <SparkleField variant="ambient" density={24} />

      <header className="relative gutter pt-8 pb-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 24 24" className="w-6 h-6 text-sakura-500" fill="currentColor">
            <path d="M12 0 L14 10 L24 12 L14 14 L12 24 L10 14 L0 12 L10 10 Z" />
          </svg>
          <div className="font-display italic text-[28px] tracking-tight text-sakura-700">
            angel
          </div>
        </div>
        <div className="flex items-center gap-2 px-4 py-1.5 rounded-pill bg-sakura-100 ring-1 ring-sakura-200">
          <div className="font-mono uppercase tracking-[0.18em] text-[10px] text-sakura-700">
            round {round} of 3
          </div>
          <div className="flex gap-1">
            {[1, 2, 3].map((r) => (
              <div
                key={r}
                className={`w-1.5 h-1.5 rounded-full ${
                  r <= round ? 'bg-sakura-500' : 'bg-sakura-200'
                }`}
              />
            ))}
          </div>
        </div>
      </header>

      <div className="relative flex-1 flex flex-col items-center justify-center gutter pb-16 z-10">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full mb-8 text-center max-w-[520px]"
        >
          <div className="font-display italic text-[44px] leading-tight tracking-tight text-sakura-800 kawaii-text-glow">
            {round === 1 && 'who catches your eye?'}
            {round === 2 && 'who feels right?'}
            {round === 3 && 'who’s yours?'}
          </div>
          <div className="font-mono uppercase tracking-[0.2em] text-[10px] text-sakura-600 mt-3 flex items-center justify-center gap-2">
            <svg viewBox="0 0 24 24" className="w-3 h-3" fill="currentColor">
              <path d="M12 0 L14 10 L24 12 L14 14 L12 24 L10 14 L0 12 L10 10 Z" />
            </svg>
            she&rsquo;s deciding too
            <svg viewBox="0 0 24 24" className="w-3 h-3" fill="currentColor">
              <path d="M12 0 L14 10 L24 12 L14 14 L12 24 L10 14 L0 12 L10 10 Z" />
            </svg>
          </div>
        </motion.div>

        <SwipeDeck />

        <div className="mt-10 flex items-center gap-8 font-mono uppercase tracking-[0.2em] text-[10px] text-sakura-700">
          <div className="flex items-center gap-2">
            <span className="inline-block w-4 h-px bg-current" />
            not her
          </div>
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-sakura-500" fill="currentColor">
              <path d="M12 21 C 12 21 2 14 2 8 C 2 5 4 3 7 3 C 9 3 11 4 12 6 C 13 4 15 3 17 3 C 20 3 22 5 22 8 C 22 14 12 21 12 21 Z" />
            </svg>
            yes
            <span className="inline-block w-4 h-px bg-current" />
          </div>
        </div>
      </div>
    </main>
  );
}
