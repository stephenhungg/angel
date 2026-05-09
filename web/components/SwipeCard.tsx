'use client';

/**
 * SwipeCard — single tinder-style card in the deck.
 *
 * Drag horizontally → tilt + opacity hint → release past threshold = swipe.
 * Hover = subtle voice tease (handled by parent).
 * Idle micro-animations: breath pulse + occasional eye-blink overlay.
 */

import { motion, useMotionValue, useTransform, type PanInfo } from 'framer-motion';
import type { LibraryEntry } from '@angel/shared';
import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';

interface SwipeCardProps {
  entry: LibraryEntry;
  onSwipe: (decision: 'yes' | 'no', burstOrigin?: { x: number; y: number }) => void;
  onHover?: (entry: LibraryEntry) => void;
  isTop: boolean;
  zIndex: number;
}

const SWIPE_THRESHOLD = 120; // px

/** Pull 3 punchy keywords from her personality_blurb to float around the card. */
function extractKeywords(blurb: string): string[] {
  if (!blurb) return [];
  const stop = new Set([
    'the', 'and', 'but', 'with', 'from', 'into', 'that', 'this', 'her', 'she',
    'has', 'have', 'will', 'are', 'was', 'were', 'been', 'when', 'just',
    'like', 'than', 'them', 'they', 'their', 'who', 'what', 'how', 'why',
    'where', 'which', 'about', 'over', 'under', 'after', 'before',
  ]);
  const words = blurb
    .toLowerCase()
    .replace(/[^a-z\s-]/g, '')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && w.length <= 12 && !stop.has(w));
  // dedupe + take first 3
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of words) {
    if (seen.has(w)) continue;
    seen.add(w);
    out.push(w);
    if (out.length === 3) break;
  }
  return out;
}

export function SwipeCard({ entry, onSwipe, onHover, isTop, zIndex }: SwipeCardProps) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-300, 0, 300], [-18, 0, 18]);
  const yesGlow = useTransform(x, [0, 200], [0, 1]);
  const noGlow = useTransform(x, [-200, 0], [1, 0]);
  const cardRef = useRef<HTMLDivElement>(null);
  const [thrown, setThrown] = useState(false);

  // subtle idle breath
  useEffect(() => {
    if (!isTop) return;
    return undefined;
  }, [isTop]);

  function handleDragEnd(_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) {
    if (Math.abs(info.offset.x) <= SWIPE_THRESHOLD) return;
    const decision: 'yes' | 'no' = info.offset.x > 0 ? 'yes' : 'no';
    const dir = info.offset.x > 0 ? 1 : -1;

    // gsap throw — capture velocity, fly off-screen with rotation arc.
    // runs ON TOP of framer's drag (which is now released).
    if (cardRef.current) {
      const releaseVel = info.velocity.x || dir * 1500;
      const throwX = dir * (Math.max(900, Math.abs(releaseVel) * 0.6));
      const throwY = -120 - Math.random() * 80;
      const throwRot = dir * (28 + Math.random() * 14);
      gsap.to(cardRef.current, {
        x: `+=${throwX}`,
        y: throwY,
        rotation: throwRot,
        opacity: 0,
        duration: 0.42,
        ease: 'power2.out',
        overwrite: 'auto',
      });
    }

    setThrown(true);

    // capture origin for heart burst (only on yes — center of card)
    let burstOrigin: { x: number; y: number } | undefined;
    if (decision === 'yes' && cardRef.current) {
      const rect = cardRef.current.getBoundingClientRect();
      burstOrigin = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    }

    // wait for throw anim to play, then notify parent (which unmounts us)
    setTimeout(() => onSwipe(decision, burstOrigin), 350);
  }

  const keywords = isTop ? extractKeywords(entry.tags.personality_blurb) : [];

  // portraits are the head + shoulders crops generated from _frames/.
  // they sit in /library/_portraits/<id>.jpg, named by vroid id.
  const thumbSrc = `/library/_portraits/${entry.id}.jpg`;

  return (
    <motion.div
      ref={cardRef}
      drag={isTop && !thrown ? 'x' : false}
      dragElastic={0.7}
      dragConstraints={{ left: 0, right: 0 }}
      onDragEnd={handleDragEnd}
      onHoverStart={() => isTop && onHover?.(entry)}
      style={{ x, rotate, zIndex }}
      animate={
        thrown
          ? undefined
          : isTop
          ? { scale: [1, 1.012, 1], y: [0, -2, 0] }
          : { scale: 1 - (4 - zIndex) * 0.04, y: (4 - zIndex) * 8, opacity: 0.7 }
      }
      transition={
        isTop
          ? { duration: 4, repeat: Infinity, ease: 'easeInOut' }
          : { duration: 0.4, ease: 'easeOut' }
      }
      className="absolute inset-0 cursor-grab active:cursor-grabbing select-none"
    >
      <div
        className={`relative w-full h-full overflow-hidden rounded-[28px] bg-cloud ring-2 ${
          isTop ? 'ring-sakura-300 kawaii-card-shadow' : 'ring-sakura-100'
        }`}
      >
        <img
          src={thumbSrc}
          alt={entry.tags.vibe_phrase}
          draggable={false}
          className="absolute inset-0 w-full h-full object-cover object-top pointer-events-none"
        />

        {/* yes overlay — kawaii pink with heart */}
        <motion.div
          style={{ opacity: yesGlow }}
          className="absolute inset-0 bg-gradient-to-l from-sakura-200/90 via-sakura-100/60 to-transparent pointer-events-none"
        >
          <div className="absolute top-6 right-6 flex items-center gap-2">
            <svg viewBox="0 0 24 24" className="w-10 h-10 text-sakura-500" fill="currentColor">
              <path d="M12 21 C 12 21 2 14 2 8 C 2 5 4 3 7 3 C 9 3 11 4 12 6 C 13 4 15 3 17 3 C 20 3 22 5 22 8 C 22 14 12 21 12 21 Z" />
            </svg>
            <div className="font-display italic text-[42px] tracking-tight text-sakura-700">
              yes
            </div>
          </div>
        </motion.div>

        {/* no overlay — soft fade, no harshness */}
        <motion.div
          style={{ opacity: noGlow }}
          className="absolute inset-0 bg-gradient-to-r from-ink-primary/55 via-ink-primary/20 to-transparent pointer-events-none"
        >
          <div className="absolute top-6 left-6 font-display italic text-[36px] tracking-tight text-cloud">
            not her
          </div>
        </motion.div>

        {/* metadata caption */}
        <div className="absolute left-0 right-0 bottom-0 p-5 bg-gradient-to-t from-sakura-900/85 via-sakura-700/30 to-transparent text-cloud">
          <div className="font-display italic text-[28px] leading-tight tracking-tight kawaii-text-glow">
            {entry.tags.vibe_phrase}
          </div>
          <div className="font-mono tracking-[0.18em] text-[10px] mt-1 opacity-80 text-sakura-100">
            {entry.tags.aesthetic.replace(/_/g, ' ')} · {entry.tags.energy_descriptor}
          </div>
        </div>

        {/* idle shimmer on top card only */}
        {isTop && <div className="absolute inset-0 kawaii-shimmer pointer-events-none mix-blend-overlay opacity-30" />}

        {/* trait keywords floating around card edges (top card only) */}
        {isTop && keywords[0] && (
          <div
            className="absolute top-4 left-4 font-mono text-[10px] uppercase tracking-[0.18em] text-cloud/85 kawaii-text-glow pointer-events-none"
            style={{ transform: 'rotate(-4deg)' }}
          >
            {keywords[0]}
          </div>
        )}
        {isTop && keywords[1] && (
          <div
            className="absolute top-1/3 right-3 font-mono text-[10px] uppercase tracking-[0.18em] text-cloud/80 pointer-events-none"
            style={{ transform: 'rotate(8deg)' }}
          >
            {keywords[1]}
          </div>
        )}
        {isTop && keywords[2] && (
          <div
            className="absolute bottom-[140px] left-5 font-mono text-[10px] uppercase tracking-[0.18em] text-sakura-100 pointer-events-none"
            style={{ transform: 'rotate(-3deg)' }}
          >
            · {keywords[2]} ·
          </div>
        )}

        {/* rarity flex — heart count from vroid hub data, if present */}
        {isTop && (entry as any).heart_count > 0 && (
          <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-0.5 rounded-pill bg-sakura-900/40 backdrop-blur-sm">
            <svg viewBox="0 0 24 24" className="w-3 h-3 text-sakura-300" fill="currentColor">
              <path d="M12 21 C 12 21 2 14 2 8 C 2 5 4 3 7 3 C 9 3 11 4 12 6 C 13 4 15 3 17 3 C 20 3 22 5 22 8 C 22 14 12 21 12 21 Z" />
            </svg>
            <span className="font-mono text-[9px] text-cloud/90 tabular-nums">
              {(entry as any).heart_count}
            </span>
          </div>
        )}
      </div>
    </motion.div>
  );
}
