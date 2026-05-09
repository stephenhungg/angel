/**
 * SparkleField — ambient kawaii twinkle layer.
 *
 * Three variants:
 *   ambient — sparse twinkles, pulsing in place (default — title + swipe bg)
 *   burst   — radial burst from center (use on big reveals)
 *   shower  — heart + sparkle rain falling top→bottom
 *
 * Pure SVG + CSS keyframes (`angel-twinkle`, `angel-drift`). No GSAP — the
 * web version used it but we already have a CSS pipeline for the rest of the
 * HUD. Persona accent is read from CSS var so the field tints itself per
 * archetype once the persona is loaded.
 */

import { useMemo } from 'react';

interface SparkleFieldProps {
  variant?: 'ambient' | 'burst' | 'shower';
  density?: number;
  /** stack-z; pass higher to float over content */
  zIndex?: number;
  className?: string;
}

const SPARKLE_PATHS = [
  'M12 0 L14 10 L24 12 L14 14 L12 24 L10 14 L0 12 L10 10 Z',
  'M12 0 L13 9 L20 4 L15 11 L24 12 L15 13 L20 20 L13 15 L12 24 L11 15 L4 20 L9 13 L0 12 L9 11 L4 4 L11 9 Z',
  'M12 8 A4 4 0 1 1 12 16 A4 4 0 1 1 12 8 Z',
];

const HEART_PATH =
  'M12 21 C 12 21 2 14 2 8 C 2 5 4 3 7 3 C 9 3 11 4 12 6 C 13 4 15 3 17 3 C 20 3 22 5 22 8 C 22 14 12 21 12 21 Z';

export function SparkleField({
  variant = 'ambient',
  density = 30,
  zIndex = 1,
  className,
}: SparkleFieldProps) {
  const items = useMemo(() => {
    return Array.from({ length: density }, (_, i) => {
      const seed = i / Math.max(1, density);
      // golden-ratio spread keeps the field even without overlap clusters
      const left = (seed * 137.5) % 100;
      const top = (seed * 41.7) % 100;
      const isHeart = variant === 'shower' && i % 3 === 0;
      const path = isHeart ? HEART_PATH : SPARKLE_PATHS[i % SPARKLE_PATHS.length]!;
      const size = 8 + Math.floor((i * 7) % 16);
      const delay = (i * 0.13) % 3;
      const duration =
        variant === 'shower'
          ? 3 + ((i * 0.31) % 3)
          : 1.4 + ((i * 0.21) % 1.6);
      const xJitter = ((i * 113) % 100) - 50; // -50..50
      return { i, left, top, path, size, delay, duration, xJitter };
    });
  }, [density, variant]);

  return (
    <div
      aria-hidden
      className={className}
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex,
      }}
    >
      {items.map((s) => {
        const baseStyle: React.CSSProperties = {
          position: 'absolute',
          width: s.size,
          height: s.size,
          color: 'var(--angel-accent)',
          filter: 'drop-shadow(0 0 6px var(--angel-accent-soft))',
        };

        if (variant === 'shower') {
          return (
            <svg
              key={s.i}
              viewBox="0 0 24 24"
              fill="currentColor"
              style={{
                ...baseStyle,
                left: `${s.left}%`,
                top: -40,
                animation: `angel-drift ${s.duration}s linear ${s.delay}s infinite`,
                transform: `translateX(${s.xJitter}px)`,
              }}
            >
              <path d={s.path} />
            </svg>
          );
        }

        if (variant === 'burst') {
          // radial burst — distribute around center using a polar layout
          const angle = (s.i / Math.max(1, density)) * Math.PI * 2;
          const dist = 80 + ((s.i * 31) % 220);
          return (
            <svg
              key={s.i}
              viewBox="0 0 24 24"
              fill="currentColor"
              style={{
                ...baseStyle,
                left: '50%',
                top: '50%',
                transform: `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px)`,
                animation: `angel-twinkle ${s.duration}s ease-in-out ${s.delay}s infinite`,
              }}
            >
              <path d={s.path} />
            </svg>
          );
        }

        // ambient
        return (
          <svg
            key={s.i}
            viewBox="0 0 24 24"
            fill="currentColor"
            style={{
              ...baseStyle,
              left: `${s.left}%`,
              top: `${s.top}%`,
              opacity: 0.7,
              animation: `angel-twinkle ${s.duration}s ease-in-out ${s.delay}s infinite`,
            }}
          >
            <path d={s.path} />
          </svg>
        );
      })}
    </div>
  );
}
