'use client';

/**
 * SparkleField — ambient kawaii twinkle layer.
 * Uses GSAP for staggered sparkle birth + drift. Pure svg, zero deps beyond gsap.
 *
 * variants:
 *   ambient  - sparse twinkles drifting upward (default)
 *   burst    - dense radial burst from center (use for reveal moments)
 *   shower   - heart + sparkle rain from top
 */

import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';

interface SparkleFieldProps {
  variant?: 'ambient' | 'burst' | 'shower';
  density?: number; // 0-100
  className?: string;
}

const SPARKLE_PATHS = [
  // 4-point star
  'M12 0 L14 10 L24 12 L14 14 L12 24 L10 14 L0 12 L10 10 Z',
  // 8-point burst
  'M12 0 L13 9 L20 4 L15 11 L24 12 L15 13 L20 20 L13 15 L12 24 L11 15 L4 20 L9 13 L0 12 L9 11 L4 4 L11 9 Z',
  // dot
  'M12 8 A4 4 0 1 1 12 16 A4 4 0 1 1 12 8 Z',
];

const HEART_PATH =
  'M12 21 C 12 21 2 14 2 8 C 2 5 4 3 7 3 C 9 3 11 4 12 6 C 13 4 15 3 17 3 C 20 3 22 5 22 8 C 22 14 12 21 12 21 Z';

const COLORS = ['#ff4f8b', '#ffb7c5', '#ff95b3', '#ff6f9d', '#ffffff', '#ffe5ee'];

export function SparkleField({
  variant = 'ambient',
  density = 30,
  className = '',
}: SparkleFieldProps) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (!ref.current) return;
      const sparkles = ref.current.querySelectorAll<SVGSVGElement>('.sparkle-svg');

      sparkles.forEach((el, i) => {
        gsap.set(el, { opacity: 0, scale: 0.2, rotation: 0 });

        if (variant === 'burst') {
          const angle = Math.random() * Math.PI * 2;
          const dist = 80 + Math.random() * 280;
          gsap.to(el, {
            x: Math.cos(angle) * dist,
            y: Math.sin(angle) * dist,
            opacity: 1,
            scale: 0.6 + Math.random() * 1.4,
            rotation: 360,
            duration: 0.9 + Math.random() * 0.8,
            delay: Math.random() * 0.4,
            ease: 'power2.out',
          });
          gsap.to(el, {
            opacity: 0,
            scale: 0.2,
            duration: 0.6,
            delay: 0.8 + Math.random() * 0.6,
            ease: 'power1.in',
          });
        } else if (variant === 'shower') {
          gsap.fromTo(
            el,
            {
              y: -100,
              x: Math.random() * window.innerWidth,
              opacity: 0,
              scale: 0.4 + Math.random() * 0.8,
              rotation: 0,
            },
            {
              y: window.innerHeight + 100,
              opacity: 1,
              rotation: 360 * (Math.random() > 0.5 ? 1 : -1),
              duration: 3 + Math.random() * 3,
              delay: Math.random() * 4,
              ease: 'none',
              repeat: -1,
            },
          );
        } else {
          // ambient
          gsap.fromTo(
            el,
            {
              opacity: 0,
              scale: 0.2 + Math.random() * 0.5,
              rotation: 0,
            },
            {
              opacity: 0.7 + Math.random() * 0.3,
              scale: 0.5 + Math.random() * 1.0,
              rotation: 360,
              duration: 1.4 + Math.random() * 1.4,
              delay: Math.random() * 2.5,
              ease: 'sine.inOut',
              repeat: -1,
              yoyo: true,
            },
          );
        }
      });
    },
    { scope: ref, dependencies: [variant, density] },
  );

  // distribute sparkles across viewport
  const items = Array.from({ length: density }, (_, i) => {
    const seed = i / density;
    const left = (seed * 137.5) % 100;
    const top = ((seed * 41.7) % 100);
    const isHeart = variant === 'shower' && Math.random() < 0.3;
    const path = isHeart ? HEART_PATH : SPARKLE_PATHS[i % SPARKLE_PATHS.length]!;
    const color = COLORS[i % COLORS.length]!;
    const size = 8 + Math.floor(((i * 7) % 16));

    return (
      <svg
        key={i}
        className="sparkle-svg absolute pointer-events-none"
        style={{
          left: variant === 'shower' ? undefined : `${left}%`,
          top: variant === 'shower' ? undefined : `${top}%`,
          width: size,
          height: size,
          color,
        }}
        viewBox="0 0 24 24"
        fill="currentColor"
      >
        <path d={path} />
      </svg>
    );
  });

  return (
    <div
      ref={ref}
      className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}
      aria-hidden
    >
      {items}
    </div>
  );
}
