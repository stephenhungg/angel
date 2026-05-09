/**
 * SwipeFlow — the page-level swipe screen.
 *
 * Mirrors web/app/swipe/page.tsx — header with round indicator, animated
 * prompt, the deck, and a key/legend strip below. Restyled to match the
 * desktop's dark plum + persona accent vibe rather than the web's
 * cream + sakura kawaii palette (the deck still pops because the cards
 * themselves carry the bright thumbnails).
 */

import { motion } from 'framer-motion';
import { useSwipeStore } from '@/lib/swipeStore';
import { SwipeDeck } from './SwipeDeck';
import { SparkleField } from './SparkleField';

export function SwipeFlow() {
  const round = useSwipeStore((s) => s.round);

  return (
    <main
      style={{
        position: 'fixed',
        inset: 0,
        background:
          'radial-gradient(ellipse at top, rgba(40,18,52,1) 0%, rgba(20,12,28,1) 50%, rgba(13,10,20,1) 100%)',
        color: 'var(--angel-fg)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        zIndex: 100,
        animation: 'angel-fade-in 320ms ease',
      }}
    >
      <SparkleField variant="ambient" density={22} zIndex={1} />

      <header
        style={{
          position: 'relative',
          zIndex: 10,
          padding: '32px 56px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            style={{
              width: 22,
              height: 22,
              color: 'var(--angel-accent)',
              filter: 'drop-shadow(0 0 12px var(--angel-accent))',
            }}
          >
            <path d="M12 0 L14 10 L24 12 L14 14 L12 24 L10 14 L0 12 L10 10 Z" />
          </svg>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 28,
              letterSpacing: '0.01em',
              color: 'var(--angel-fg)',
            }}
          >
            angel
            <span style={{ color: 'var(--angel-accent)' }}>.</span>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '6px 14px',
            borderRadius: 999,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid var(--angel-accent-soft)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-ui)',
              fontSize: 10,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--angel-fg-muted)',
            }}
          >
            round {round} of 3
          </span>
          <span style={{ display: 'flex', gap: 4 }}>
            {[1, 2, 3].map((r) => (
              <span
                key={r}
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 999,
                  background: r <= round ? 'var(--angel-accent)' : 'rgba(255,255,255,0.18)',
                  boxShadow: r <= round ? '0 0 8px var(--angel-accent)' : 'none',
                }}
              />
            ))}
          </span>
        </div>
      </header>

      <div
        style={{
          position: 'relative',
          zIndex: 10,
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 56px 64px',
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          style={{ width: '100%', maxWidth: 520, marginBottom: 32, textAlign: 'center' }}
        >
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 44,
              lineHeight: 1.1,
              letterSpacing: '0.005em',
              color: 'var(--angel-fg)',
              textShadow: '0 0 28px var(--angel-accent-soft)',
            }}
          >
            {round === 1 && 'who catches your eye?'}
            {round === 2 && 'who feels right?'}
            {round === 3 && "who's yours?"}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-ui)',
              fontSize: 10,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: 'var(--angel-fg-muted)',
              marginTop: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <SparkleGlyph />
            she's deciding too
            <SparkleGlyph />
          </div>
        </motion.div>

        <SwipeDeck />

        <div
          style={{
            marginTop: 36,
            display: 'flex',
            alignItems: 'center',
            gap: 36,
            fontFamily: 'var(--font-ui)',
            fontSize: 10,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: 'var(--angel-fg-muted)',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 16, height: 1, background: 'currentColor' }} />
            not her
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--angel-accent)' }}>
            <svg viewBox="0 0 24 24" style={{ width: 14, height: 14 }} fill="currentColor">
              <path d="M12 21 C 12 21 2 14 2 8 C 2 5 4 3 7 3 C 9 3 11 4 12 6 C 13 4 15 3 17 3 C 20 3 22 5 22 8 C 22 14 12 21 12 21 Z" />
            </svg>
            yes
            <span style={{ width: 16, height: 1, background: 'currentColor' }} />
          </span>
        </div>
      </div>
    </main>
  );
}

function SparkleGlyph() {
  return (
    <svg viewBox="0 0 24 24" style={{ width: 12, height: 12, color: 'var(--angel-accent)' }} fill="currentColor">
      <path d="M12 0 L14 10 L24 12 L14 14 L12 24 L10 14 L0 12 L10 10 Z" />
    </svg>
  );
}
