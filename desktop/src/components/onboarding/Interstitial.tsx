/**
 * Interstitial — between-round 2.2s beat.
 * Cliffhanger copy that sells the math viscerally before round 2 + 3.
 *
 * Ported from web/components/Interstitial.tsx — same copy, restyled to use
 * persona accent + display font instead of sakura tokens.
 */

import { motion } from 'framer-motion';
import { useEffect } from 'react';

const COPY: Record<1 | 2, string[]> = {
  1: ['wait.', "i'm seeing something."],
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
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <motion.svg
        viewBox="0 0 24 24"
        fill="currentColor"
        style={{ width: 36, height: 36, color: 'var(--angel-accent)', filter: 'drop-shadow(0 0 12px var(--angel-accent))' }}
        initial={{ opacity: 0, scale: 0, rotate: 0 }}
        animate={{ opacity: 1, scale: 1, rotate: 360 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        <path d="M12 0 L14 10 L24 12 L14 14 L12 24 L10 14 L0 12 L10 10 Z" />
      </motion.svg>
      {lines.map((line, i) => (
        <motion.div
          key={i}
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 56,
            lineHeight: 1,
            letterSpacing: '0.005em',
            color: 'var(--angel-fg)',
            textAlign: 'center',
            textShadow: '0 0 28px var(--angel-accent-soft)',
          }}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 + i * 0.7, duration: 0.5, ease: 'easeOut' }}
        >
          {line}
        </motion.div>
      ))}
    </motion.div>
  );
}
