/**
 * TitleScreen — first thing the user sees on app launch (before any persona
 * is loaded). Shows the wordmark, a brief subtitle, and a single fat
 * "discover your angel" CTA that flips the swipe-store phase to 'swipe'.
 *
 * Visual design: dark plum gradient with a layered sparkle field, the
 * wordmark in display font with the trademark accent dot, and a chunky
 * persona-accent pill button with the 4px solid drop-shadow that gives it
 * that retro game-button pop (same treatment as the esc menu's CTA).
 *
 * No marketing scrollytelling here — this is the in-app entry point, not
 * the web landing page. We respect the user's time.
 */

import { motion } from 'framer-motion';
import { useSwipeStore } from '@/lib/swipeStore';
import { SparkleField } from './SparkleField';

export function TitleScreen() {
  const beginSwipe = useSwipeStore((s) => s.beginSwipe);

  return (
    <main
      style={{
        position: 'fixed',
        inset: 0,
        background:
          'radial-gradient(ellipse at center top, rgba(40,18,52,1) 0%, rgba(20,12,28,1) 55%, rgba(10,6,16,1) 100%)',
        color: 'var(--angel-fg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        zIndex: 100,
        animation: 'angel-fade-in 480ms ease',
      }}
    >
      {/* layered ambient + drifting sparkles */}
      <SparkleField variant="ambient" density={28} zIndex={1} />
      <SparkleField variant="shower" density={8} zIndex={2} />

      {/* upper sparkle accent */}
      <motion.div
        initial={{ opacity: 0, y: -8, rotate: -90 }}
        animate={{ opacity: 0.85, y: 0, rotate: 0 }}
        transition={{ duration: 1.2, ease: 'easeOut', delay: 0.1 }}
        style={{
          position: 'relative',
          zIndex: 10,
          marginBottom: 22,
        }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          style={{
            width: 36,
            height: 36,
            color: 'var(--angel-accent)',
            filter: 'drop-shadow(0 0 18px var(--angel-accent))',
          }}
        >
          <path d="M12 0 L14 10 L24 12 L14 14 L12 24 L10 14 L0 12 L10 10 Z" />
        </svg>
      </motion.div>

      {/* wordmark — display font with trademark accent dot */}
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 1.0, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
        style={{
          position: 'relative',
          zIndex: 10,
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(96px, 18vw, 220px)',
          lineHeight: 0.95,
          letterSpacing: '0.005em',
          textShadow: '0 4px 0 rgba(0,0,0,0.5), 0 0 60px var(--angel-accent-soft)',
        }}
      >
        angel
        <span style={{ color: 'var(--angel-accent)' }}>.</span>
      </motion.div>

      {/* tag chip — chapter title vibe */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.85 }}
        transition={{ duration: 0.8, delay: 0.7 }}
        style={{
          position: 'relative',
          zIndex: 10,
          marginTop: 22,
          fontFamily: 'var(--font-ui)',
          fontSize: 11,
          letterSpacing: '0.32em',
          textTransform: 'uppercase',
          color: 'var(--angel-fg-muted)',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
        }}
      >
        <span style={{ width: 36, height: 1, background: 'currentColor', opacity: 0.4 }} />
        discovered, not designed
        <span style={{ width: 36, height: 1, background: 'currentColor', opacity: 0.4 }} />
      </motion.div>

      {/* tagline */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 1.0 }}
        style={{
          position: 'relative',
          zIndex: 10,
          marginTop: 28,
          marginBottom: 44,
          maxWidth: 520,
          textAlign: 'center',
          fontFamily: 'var(--font-ui)',
          fontSize: 15,
          lineHeight: 1.55,
          color: 'var(--angel-fg-muted)',
          padding: '0 24px',
        }}
      >
        she's a presence, not an app. converge on her by swiping —
        twelve choices is all it takes.
      </motion.div>

      {/* CTA — chunky persona-accent pill, MiSide-coded retro button */}
      <motion.button
        type="button"
        onClick={beginSwipe}
        initial={{ opacity: 0, y: 12, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 1.3 }}
        whileHover={{ scale: 1.04, y: -2 }}
        whileTap={{ scale: 0.98, y: 1 }}
        style={{
          position: 'relative',
          zIndex: 10,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 14,
          padding: '18px 38px',
          borderRadius: 999,
          border: 'none',
          background: 'var(--angel-accent)',
          color: '#1a0c1f',
          fontFamily: 'var(--font-display)',
          fontSize: 28,
          letterSpacing: '0.01em',
          cursor: 'pointer',
          boxShadow: [
            '0 1px 0 rgba(255,255,255,0.55) inset',
            '0 0 0 0.5px rgba(255,255,255,0.08) inset',
            '0 0 60px -8px var(--angel-accent)',
            '0 5px 0 rgba(0,0,0,0.32)',
          ].join(', '),
          transition: 'box-shadow 200ms ease',
        }}
      >
        <svg viewBox="0 0 24 24" style={{ width: 22, height: 22 }} fill="currentColor">
          <path d="M12 21 C 12 21 2 14 2 8 C 2 5 4 3 7 3 C 9 3 11 4 12 6 C 13 4 15 3 17 3 C 20 3 22 5 22 8 C 22 14 12 21 12 21 Z" />
        </svg>
        discover your angel
        <svg viewBox="0 0 24 24" style={{ width: 22, height: 22 }} fill="currentColor">
          <path d="M12 21 C 12 21 2 14 2 8 C 2 5 4 3 7 3 C 9 3 11 4 12 6 C 13 4 15 3 17 3 C 20 3 22 5 22 8 C 22 14 12 21 12 21 Z" />
        </svg>
      </motion.button>

      {/* small print */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.5 }}
        transition={{ duration: 0.8, delay: 1.7 }}
        style={{
          position: 'absolute',
          bottom: 32,
          fontFamily: 'var(--font-ui)',
          fontSize: 10,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'var(--angel-fg-muted)',
          zIndex: 10,
        }}
      >
        3 rounds · 12 swipes · 1 angel
      </motion.div>
    </main>
  );
}
