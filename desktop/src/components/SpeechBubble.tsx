/**
 * components/SpeechBubble.tsx — world-anchored speech bubble above the avatar.
 *
 * Two presentational variants in this file:
 *
 *   1. <SpeechBubble />            ← drei <Html> portal. Must be rendered
 *                                    inside the R3F <Canvas/> tree. Anchors
 *                                    to a world position (default above the
 *                                    center anchor; pass `position` prop to
 *                                    follow the head bone).
 *   2. <SpeechBubbleOverlay />     ← pure DOM screen overlay. Renders fixed
 *                                    above center of viewport. No Canvas
 *                                    required. Safe fallback.
 *
 * Content: reads `useAngelStore.bubble` for the active line. Performs a
 * char-by-char reveal driven by a local timer (~32ms/char). When the
 * renderer plan's animalese.ts lands, swap the timer for animalese onChar
 * via the `revealChars` prop (default: timer-based).
 *
 * Aesthetic:
 *   - Cherry Bomb One @ 28-44px (scales with distance for 3D variant)
 *   - Rounded squircle bg with persona-tinted border + chunky soft shadow
 *   - Tail pointing toward avatar head
 *   - Animated fade-in/out (framer-motion when DOM, AnimatePresence on bubble)
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Html } from '@react-three/drei';
import { motion, AnimatePresence } from 'framer-motion';
import { useAngelStore } from '../stores/angel';
import type { Emotion } from '@angel/shared';

const REVEAL_MS_PER_CHAR = 32;
const HOLD_AFTER_REVEAL_MS = 300;

/* ------------------------------------------------------------------ */
/* shared content renderer                                             */
/* ------------------------------------------------------------------ */

function useRevealedText(text: string | null): string {
  const [revealed, setRevealed] = useState('');
  const lastTextRef = useRef<string | null>(null);

  useEffect(() => {
    if (!text) {
      setRevealed('');
      lastTextRef.current = null;
      return;
    }
    if (lastTextRef.current === text) return;
    lastTextRef.current = text;
    setRevealed('');

    let i = 0;
    const tick = () => {
      i += 1;
      setRevealed(text.slice(0, i));
      if (i < text.length) timer = window.setTimeout(tick, REVEAL_MS_PER_CHAR);
    };
    let timer = window.setTimeout(tick, REVEAL_MS_PER_CHAR);
    return () => {
      window.clearTimeout(timer);
    };
  }, [text]);

  return revealed;
}

function emotionAccentDelta(emotion?: Emotion): { scale: number; tilt: number } {
  switch (emotion) {
    case 'excited':
      return { scale: 1.06, tilt: -2 };
    case 'happy':
      return { scale: 1.03, tilt: -1 };
    case 'thinking':
    case 'concerned':
      return { scale: 0.98, tilt: 1 };
    case 'soft':
      return { scale: 1.0, tilt: 0 };
    default:
      return { scale: 1, tilt: 0 };
  }
}

interface BubbleBodyProps {
  text: string;
  fullText: string;
  emotion?: Emotion;
  accent: string;
  fontSize?: number;
}

function BubbleBody({ text, fullText, emotion, accent, fontSize = 26 }: BubbleBodyProps) {
  const { scale, tilt } = useMemo(() => emotionAccentDelta(emotion), [emotion]);
  const isComplete = text.length >= fullText.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale, rotate: tilt }}
      exit={{ opacity: 0, y: -6, scale: 0.94, transition: { duration: 0.36 } }}
      transition={{ type: 'spring', stiffness: 220, damping: 22 }}
      style={{
        position: 'relative',
        background: 'rgba(13, 10, 20, 0.86)',
        border: `2px solid ${accent}`,
        borderRadius: 22,
        padding: '14px 22px 16px',
        maxWidth: 520,
        minWidth: 120,
        textAlign: 'center',
        boxShadow: `0 18px 48px -16px ${accent}88, 0 0 0 1px rgba(255,255,255,0.05) inset`,
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        userSelect: 'none',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-bubble)',
          fontWeight: 400,
          fontSize,
          lineHeight: 1.18,
          color: 'var(--angel-fg)',
          letterSpacing: '0.005em',
          textShadow: `0 2px 18px ${accent}55, 0 0 1px rgba(0,0,0,0.6)`,
          display: 'inline-block',
        }}
      >
        {text}
        {!isComplete && (
          <motion.span
            animate={{ opacity: [0.2, 1, 0.2] }}
            transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              display: 'inline-block',
              width: '0.42em',
              marginLeft: 2,
              color: accent,
            }}
          >
            ▌
          </motion.span>
        )}
      </span>

      {/* tail */}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          bottom: -10,
          left: '50%',
          width: 18,
          height: 18,
          background: 'rgba(13, 10, 20, 0.86)',
          borderRight: `2px solid ${accent}`,
          borderBottom: `2px solid ${accent}`,
          transform: 'translateX(-50%) rotate(45deg)',
          borderBottomRightRadius: 4,
        }}
      />
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* drei <Html> 3D portal variant                                       */
/* ------------------------------------------------------------------ */

export interface SpeechBubble3DProps {
  /** world-space anchor — typically the avatar's head bone position + 0.3y */
  position?: [number, number, number];
  /** font size in CSS pixels (drei Html uses CSS sizing) */
  fontSize?: number;
}

/**
 * Default export: 3D bubble. Renders inside R3F Canvas tree. Reads bubble
 * content from useAngelStore.
 */
export function SpeechBubble({ position = [0, 1.7, 0], fontSize = 24 }: SpeechBubble3DProps = {}) {
  const bubble = useAngelStore((s) => s.bubble);
  const persona = useAngelStore((s) => s.persona);
  const accent = persona?.paletteHex ?? '#ff7eb6';

  const text = bubble?.text ?? '';
  const revealed = useRevealedText(text || null);

  return (
    <Html
      position={position}
      center
      distanceFactor={4}
      occlude={false}
      style={{
        pointerEvents: 'none',
        transition: 'opacity 200ms ease',
      }}
      zIndexRange={[20, 0]}
    >
      <AnimatePresence mode="wait">
        {bubble && (
          <BubbleBody
            key={bubble.visibleAt}
            text={revealed}
            fullText={text}
            emotion={bubble.emotion}
            accent={accent}
            fontSize={fontSize}
          />
        )}
      </AnimatePresence>
    </Html>
  );
}

/* ------------------------------------------------------------------ */
/* DOM overlay variant                                                 */
/* ------------------------------------------------------------------ */

/**
 * Pure DOM speech bubble — fixed-position overlay near top-center of viewport.
 * Use in `<div className="hud">` outside the R3F canvas. No 3D math.
 */
export function SpeechBubbleOverlay() {
  const bubble = useAngelStore((s) => s.bubble);
  const persona = useAngelStore((s) => s.persona);
  const accent = persona?.paletteHex ?? '#ff7eb6';

  const text = bubble?.text ?? '';
  const revealed = useRevealedText(text || null);

  // 300ms hold after reveal completes — local timer to dismiss
  const [showHold, setShowHold] = useState(false);
  useEffect(() => {
    if (!bubble) {
      setShowHold(false);
      return;
    }
    if (revealed.length < text.length) {
      setShowHold(false);
      return;
    }
    const t = window.setTimeout(() => setShowHold(true), HOLD_AFTER_REVEAL_MS);
    return () => window.clearTimeout(t);
  }, [bubble, revealed.length, text.length]);

  return (
    <div
      style={{
        position: 'fixed',
        top: '24%',
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        zIndex: 25,
        pointerEvents: 'none',
      }}
      aria-live="polite"
    >
      <AnimatePresence mode="wait">
        {bubble && !showHold && (
          <BubbleBody
            key={bubble.visibleAt}
            text={revealed}
            fullText={text}
            emotion={bubble.emotion}
            accent={accent}
            fontSize={36}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default SpeechBubble;
