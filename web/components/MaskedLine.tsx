"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

/**
 * MaskedLine — gsap masked-lines reveal for a single line of text.
 *
 * Wraps the child in an `overflow:hidden` mask. The inner element starts at
 * `yPercent: 100` (below the mask) + `opacity: 0`, then animates up into view
 * once it scrolls into the viewport. Result: the line "rises from behind a
 * curtain."
 *
 * lifted from portfolio-temp; uses IntersectionObserver in place of the
 * portfolio's useLoaderReady gate so it works post-bait without a global
 * loader bus.
 */
type Props = {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  ease?: string;
  className?: string;
  /** play immediately on mount instead of waiting for IO. use for above-fold lines. */
  immediate?: boolean;
};

export function MaskedLine({
  children,
  delay = 0,
  duration = 1.2,
  ease = "expo.out",
  className = "",
  immediate = false,
}: Props) {
  const innerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = innerRef.current;
    if (!node) return;

    gsap.set(node, { yPercent: 100, opacity: 0 });

    const play = () => {
      gsap.to(node, { yPercent: 0, opacity: 1, duration, delay, ease });
    };

    if (immediate) {
      play();
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            play();
            io.disconnect();
            break;
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.05 },
    );
    io.observe(node);

    return () => {
      io.disconnect();
    };
  }, [delay, duration, ease, immediate]);

  return (
    <div className={`overflow-hidden ${className}`}>
      <div ref={innerRef} className="will-change-transform">
        {children}
      </div>
    </div>
  );
}
