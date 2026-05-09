'use client';

/**
 * HeartBurst — gsap-driven dopamine spike on swipe right.
 *
 * 8 mini hearts radiate from a center point, each at a different angle/rotation/decay.
 * fires once per yes-swipe (parent passes a `triggerKey` that changes per fire).
 */

import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';

interface HeartBurstProps {
  triggerKey: number;        // changes every time we want to fire
  originX?: number;           // px from page top-left
  originY?: number;
}

const HEARTS = 10;

export function HeartBurst({ triggerKey, originX = 0, originY = 0 }: HeartBurstProps) {
  const ref = useRef<HTMLDivElement>(null);
  const lastFired = useRef(0);

  useEffect(() => {
    if (triggerKey === lastFired.current || !ref.current) return;
    lastFired.current = triggerKey;

    const hearts = ref.current.querySelectorAll<HTMLElement>('.burst-heart');

    hearts.forEach((el, i) => {
      const angle = (i / HEARTS) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const dist = 80 + Math.random() * 90;
      const rotateEnd = (Math.random() - 0.5) * 540;
      const scaleEnd = 0.4 + Math.random() * 0.6;
      const duration = 0.7 + Math.random() * 0.4;

      gsap.set(el, {
        x: 0,
        y: 0,
        opacity: 0,
        scale: 0.2,
        rotation: 0,
      });

      // pop in
      gsap.to(el, {
        opacity: 1,
        scale: 1.4,
        duration: 0.12,
        ease: 'back.out(2)',
      });

      // fly out
      gsap.to(el, {
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist - 20,
        rotation: rotateEnd,
        scale: scaleEnd,
        duration,
        ease: 'power2.out',
      });

      // fade
      gsap.to(el, {
        opacity: 0,
        delay: duration * 0.4,
        duration: duration * 0.6,
        ease: 'power1.in',
      });
    });
  }, [triggerKey]);

  if (triggerKey === 0) return null;

  return (
    <div
      ref={ref}
      className="fixed pointer-events-none z-50"
      style={{
        left: originX,
        top: originY,
        width: 0,
        height: 0,
      }}
      aria-hidden
    >
      {[...Array(HEARTS)].map((_, i) => (
        <div
          key={i}
          className="burst-heart absolute"
          style={{
            left: -12,
            top: -12,
            width: 24,
            height: 24,
          }}
        >
          <svg
            viewBox="0 0 24 24"
            className="w-full h-full text-sakura-500 drop-shadow-[0_0_12px_rgba(255,79,139,0.6)]"
            fill="currentColor"
          >
            <path d="M12 21 C 12 21 2 14 2 8 C 2 5 4 3 7 3 C 9 3 11 4 12 6 C 13 4 15 3 17 3 C 20 3 22 5 22 8 C 22 14 12 21 12 21 Z" />
          </svg>
        </div>
      ))}
    </div>
  );
}
