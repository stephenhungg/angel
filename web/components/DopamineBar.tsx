'use client';

/**
 * DopamineBar — log-form progress bar that fills as user swipes.
 *
 * progress = log(swipes + 1) / log(13)
 *   swipe 0 → 0%
 *   swipe 1 → 27%
 *   swipe 2 → 43%
 *   swipe 4 → 63%
 *   swipe 8 → 86%
 *   swipe 12 → 100%
 *
 * fast burst at start, asymptotic toward 100% — feels like progress accelerates
 * out the gate (instant gratification) then teases at the end (anticipation).
 */

import { motion } from 'framer-motion';
import { useSwipeStore } from '@/lib/swipe-store';

const TOTAL_SWIPES = 12;

export function DopamineBar() {
  const history = useSwipeStore((s) => s.history);
  const swipes = history.length;

  // log-curve fill — fast at first, slow near 100%
  const pct =
    swipes === 0
      ? 0
      : Math.min(100, (Math.log(swipes + 1) / Math.log(TOTAL_SWIPES + 1)) * 100);

  // taunt copy near the end
  const taunt =
    pct >= 95
      ? 'almost'
      : pct >= 75
      ? 'closer'
      : pct >= 50
      ? 'getting there'
      : pct >= 25
      ? 'tell me more'
      : 'show me';

  return (
    <div className="w-full max-w-[420px] mx-auto px-2">
      <div className="flex items-center justify-between mb-1.5">
        <div className="font-mono uppercase tracking-[0.2em] text-[9px] text-sakura-700">
          {taunt}
        </div>
        <div className="font-mono text-[9px] text-sakura-600 tabular-nums">
          {Math.round(pct)}%
        </div>
      </div>
      <div className="relative h-2 rounded-pill bg-sakura-100 overflow-hidden ring-1 ring-sakura-200">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-pill"
          style={{
            background:
              'linear-gradient(90deg, #ff95b3 0%, #ff4f8b 60%, #ff6f9d 100%)',
            boxShadow: '0 0 12px rgba(255, 79, 139, 0.6)',
          }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ type: 'spring', stiffness: 110, damping: 18 }}
        />
        {/* shimmer overlay for the active fill */}
        {pct > 0 && pct < 100 && (
          <motion.div
            className="absolute inset-y-0 w-12 pointer-events-none"
            style={{
              background:
                'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.5) 50%, transparent 100%)',
            }}
            animate={{ x: ['-100%', `${pct * 4}px`] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
        {/* sparkle at the leading edge near completion */}
        {pct > 80 && pct < 100 && (
          <motion.div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3"
            style={{ left: `calc(${pct}% - 6px)` }}
            animate={{ rotate: 360, scale: [1, 1.3, 1] }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          >
            <svg viewBox="0 0 24 24" className="w-full h-full text-sakura-500" fill="currentColor">
              <path d="M12 0 L14 10 L24 12 L14 14 L12 24 L10 14 L0 12 L10 10 Z" />
            </svg>
          </motion.div>
        )}
      </div>
    </div>
  );
}
