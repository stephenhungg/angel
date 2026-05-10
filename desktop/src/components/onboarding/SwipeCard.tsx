/**
 * SwipeCard — single tinder-style card. Ported from web/components/SwipeCard.tsx.
 * Image src: /library/_portraits/<id>.jpg (synced from web/public/library/_portraits/).
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

  const thumbSrc = `/library/_portraits/${entry.id}.jpg`;

  return (
    <motion.div
      drag={isTop ? 'x' : false}
      dragElastic={0.7}
      dragConstraints={{ left: 0, right: 0 }}
      onDragEnd={handleDragEnd}
      onHoverStart={() => isTop && onHover?.(entry)}
      style={{ x, rotate, zIndex }}
      animate={
        isTop
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

        <motion.div
          style={{ opacity: noGlow }}
          className="absolute inset-0 bg-gradient-to-r from-ink-primary/55 via-ink-primary/20 to-transparent pointer-events-none"
        >
          <div className="absolute top-6 left-6 font-display italic text-[36px] tracking-tight text-cloud">
            not her
          </div>
        </motion.div>

        <div className="absolute left-0 right-0 bottom-0 p-5 bg-gradient-to-t from-sakura-900/85 via-sakura-700/30 to-transparent text-cloud">
          <div className="font-display italic text-[28px] leading-tight tracking-tight kawaii-text-glow">
            {entry.tags.vibe_phrase}
          </div>
          <div className="font-mono tracking-[0.18em] text-[10px] mt-1 opacity-80 text-sakura-100">
            {entry.tags.aesthetic.replace(/_/g, ' ')} · {entry.tags.energy_descriptor}
          </div>
        </div>

        {isTop && (
          <div className="absolute inset-0 kawaii-shimmer pointer-events-none mix-blend-overlay opacity-30" />
        )}
      </div>
    </motion.div>
  );
}
