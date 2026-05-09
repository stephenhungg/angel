/**
 * TitleScreen — first thing the user sees on app launch (before any persona
 * is loaded). Kawaii-coded landing: dark plum gradient, sparkle field, the
 * pink wordmark image, mascot accent, and a chunky persona-accent CTA that
 * fires onBegin to advance App.tsx's phase machine into 'onboarding'.
 *
 * Doesn't own the swipe-store phase — App.tsx is the source of truth for
 * which screen is active. This component only signals "user clicked begin".
 */

import { motion } from 'framer-motion';
import { SparkleField } from './SparkleField';

interface TitleScreenProps {
  onBegin: () => void;
}

export function TitleScreen({ onBegin }: TitleScreenProps) {
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

      {/* tenshi (angel) stamp — top-right corner accent */}
      <motion.img
        src="/kawaii/tenshi-stamp-t.png"
        alt=""
        initial={{ opacity: 0, scale: 0.8, rotate: -8 }}
        animate={{ opacity: 0.85, scale: 1, rotate: 0 }}
        transition={{ duration: 1.0, ease: 'easeOut', delay: 0.3 }}
        style={{
          position: 'absolute',
          top: 56,
          right: 64,
          width: 96,
          height: 'auto',
          zIndex: 5,
          filter: 'drop-shadow(0 0 24px var(--angel-accent-soft))',
          pointerEvents: 'none',
        }}
      />

      {/* mascot wave — bottom-left peeking in */}
      <motion.img
        src="/kawaii/mascot-wave-t.png"
        alt=""
        initial={{ opacity: 0, x: -20, y: 20 }}
        animate={{ opacity: 0.95, x: 0, y: 0 }}
        transition={{ duration: 1.1, ease: 'easeOut', delay: 0.9 }}
        style={{
          position: 'absolute',
          bottom: 24,
          left: 36,
          width: 168,
          height: 'auto',
          zIndex: 5,
          filter: 'drop-shadow(0 8px 30px rgba(0,0,0,0.45))',
          pointerEvents: 'none',
        }}
      />

      {/* upper sparkle accent above the wordmark */}
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

      {/* wordmark — kawaii pink lockup, replaces the text "angel." */}
      <motion.img
        src="/kawaii/wordmark-pink-nano-t.png"
        alt="angel"
        initial={{ opacity: 0, y: 16, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 1.0, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
        style={{
          position: 'relative',
          zIndex: 10,
          width: 'min(72vw, 720px)',
          height: 'auto',
          filter: 'drop-shadow(0 6px 0 rgba(0,0,0,0.35)) drop-shadow(0 0 60px var(--angel-accent-soft))',
        }}
      />

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
        she&rsquo;s a presence, not an app. converge on her by swiping —
        twelve choices is all it takes.
      </motion.div>

      {/* CTA — chunky persona-accent pill, kawaii strawberry flank */}
      <motion.button
        type="button"
        onClick={onBegin}
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
        <img
          src="/kawaii/cute-strawberry-t.png"
          alt=""
          style={{ width: 28, height: 28, objectFit: 'contain' }}
        />
        discover your angel
        <img
          src="/kawaii/cute-bow-t.png"
          alt=""
          style={{ width: 28, height: 28, objectFit: 'contain' }}
        />
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
