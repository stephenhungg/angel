/**
 * SwipeCard — single tinder-style card in the deck.
 *
 * Drag horizontally → tilt + opacity hint → release past threshold = swipe.
 * Hover triggers a 0.45s animalese voice tease using her own VoiceConfig.
 *
 * Ported from web/components/SwipeCard.tsx with styling moved to inline so it
 * matches the rest of the desktop HUD pattern. Uses persona accent for the
 * 'yes' overlay tint, dark plum for 'not her'.
 */

import { motion, useMotionValue, useTransform, type PanInfo } from 'framer-motion';
import type { LibraryEntry } from '@angel/shared';

interface SwipeCardProps {
  entry: LibraryEntry;
  onSwipe: (decision: 'yes' | 'no') => void;
  onHover?: (entry: LibraryEntry) => void;
  isTop: boolean;
  zIndex: number;
}

const SWIPE_THRESHOLD = 120;

export function SwipeCard({ entry, onSwipe, onHover, isTop, zIndex }: SwipeCardProps) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-300, 0, 300], [-18, 0, 18]);
  const yesGlow = useTransform(x, [0, 200], [0, 1]);
  const noGlow = useTransform(x, [-200, 0], [1, 0]);

  function handleDragEnd(_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) {
    if (info.offset.x > SWIPE_THRESHOLD) onSwipe('yes');
    else if (info.offset.x < -SWIPE_THRESHOLD) onSwipe('no');
  }

  const thumbSrc = `/library/${entry.id}.jpg`;
  // back-of-stack scaling so the cards behind the top peek out a little
  const backDepth = Math.max(0, 4 - zIndex);

  return (
    <motion.div
      drag={isTop ? 'x' : false}
      dragElastic={0.7}
      dragConstraints={{ left: 0, right: 0 }}
      onDragEnd={handleDragEnd}
      onHoverStart={() => isTop && onHover?.(entry)}
      style={{
        position: 'absolute',
        inset: 0,
        cursor: isTop ? 'grab' : 'default',
        userSelect: 'none',
        x,
        rotate,
        zIndex,
      }}
      whileTap={isTop ? { cursor: 'grabbing' } : undefined}
      animate={
        isTop
          ? { scale: [1, 1.012, 1], y: [0, -2, 0] }
          : { scale: 1 - backDepth * 0.04, y: backDepth * 8, opacity: 0.7 }
      }
      transition={
        isTop
          ? { duration: 4, repeat: Infinity, ease: 'easeInOut' }
          : { duration: 0.4, ease: 'easeOut' }
      }
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          borderRadius: 28,
          overflow: 'hidden',
          background: 'rgba(20, 12, 28, 0.92)',
          border: isTop ? '2px solid var(--angel-accent)' : '2px solid var(--angel-accent-soft)',
          boxShadow: isTop
            ? [
                '0 4px 0 rgba(0,0,0,0.3)',
                '0 18px 50px -12px rgba(0,0,0,0.7)',
                '0 0 60px -16px var(--angel-accent)',
                '0 1px 0 rgba(255,255,255,0.12) inset',
              ].join(', ')
            : '0 12px 32px -10px rgba(0,0,0,0.5)',
        }}
      >
        <img
          src={thumbSrc}
          alt={entry.tags.vibe_phrase}
          draggable={false}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'top',
            pointerEvents: 'none',
          }}
        />

        {/* yes overlay — persona-accent wash with heart */}
        <motion.div
          style={{
            opacity: yesGlow,
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background:
              'linear-gradient(270deg, var(--angel-accent-soft) 0%, rgba(255,255,255,0.12) 60%, transparent 100%)',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 24,
              right: 24,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <svg viewBox="0 0 24 24" style={{ width: 38, height: 38, color: 'var(--angel-accent)' }} fill="currentColor">
              <path d="M12 21 C 12 21 2 14 2 8 C 2 5 4 3 7 3 C 9 3 11 4 12 6 C 13 4 15 3 17 3 C 20 3 22 5 22 8 C 22 14 12 21 12 21 Z" />
            </svg>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 42,
                lineHeight: 1,
                letterSpacing: '0.005em',
                color: 'var(--angel-accent)',
                textShadow: '0 0 18px var(--angel-accent-soft)',
              }}
            >
              yes
            </div>
          </div>
        </motion.div>

        {/* no overlay — dark wash + hard text */}
        <motion.div
          style={{
            opacity: noGlow,
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background: 'linear-gradient(90deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.2) 60%, transparent 100%)',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 24,
              left: 24,
              fontFamily: 'var(--font-display)',
              fontSize: 36,
              lineHeight: 1,
              letterSpacing: '0.005em',
              color: 'rgba(255,255,255,0.9)',
            }}
          >
            not her
          </div>
        </motion.div>

        {/* metadata caption */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            padding: 20,
            background:
              'linear-gradient(to top, rgba(13,10,20,0.92) 0%, rgba(13,10,20,0.4) 60%, transparent 100%)',
            color: 'var(--angel-fg)',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 26,
              lineHeight: 1.15,
              letterSpacing: '0.005em',
              textShadow: '0 0 18px var(--angel-accent-soft)',
            }}
          >
            {entry.tags.vibe_phrase}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-ui)',
              fontSize: 10,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              opacity: 0.7,
              marginTop: 4,
            }}
          >
            {entry.tags.aesthetic.replace(/_/g, ' ')} · {entry.tags.energy_descriptor}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
