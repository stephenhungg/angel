'use client';

/**
 * Interstitial — between-round 1.2s beat.
 * Cliffhanger copy, not statement. Sells the math viscerally.
 */

import { motion } from 'framer-motion';
import { useEffect } from 'react';

const COPY: Record<1 | 2, string[]> = {
  1: ['wait.', 'i&rsquo;m seeing something.'],
  2: ['closer.', 'one more.'],
};

interface InterstitialProps {
  round: 1 | 2 | 3;
  onComplete: () => void;
}

export function Interstitial({ round, onComplete }: InterstitialProps) {
  const lines = COPY[round as 1 | 2] ?? COPY[1];

  useEffect(() => {
    const t = setTimeout(onComplete, 2200);
    return () => clearTimeout(t);
  }, [onComplete]);

  return (
    <motion.div
      key={`int-${round}`}
      className="absolute inset-0 flex flex-col items-center justify-center gap-3"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <motion.svg
        viewBox="0 0 24 24"
        className="w-8 h-8 text-sakura-400"
        fill="currentColor"
        initial={{ opacity: 0, scale: 0, rotate: 0 }}
        animate={{ opacity: 1, scale: 1, rotate: 360 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        <path d="M12 0 L14 10 L24 12 L14 14 L12 24 L10 14 L0 12 L10 10 Z" />
      </motion.svg>
      {lines.map((line, i) => (
        <motion.div
          key={i}
          className="font-display italic text-[48px] leading-none tracking-tight text-sakura-700 kawaii-text-glow text-center"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 + i * 0.7, duration: 0.5, ease: 'easeOut' }}
          dangerouslySetInnerHTML={{ __html: line }}
        />
      ))}
    </motion.div>
  );
}
