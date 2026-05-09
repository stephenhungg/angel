"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

/**
 * MaskedLine — gsap masked-line reveal for a single line of text.
 *
 *   <div overflow:hidden>      ← mask
 *     <div yPercent: 100>      ← inner, slides up from below
 *       {children}
 *     </div>
 *   </div>
 *
 * Plays on enter via IntersectionObserver, BUT also checks if already in
 * viewport at mount (e.g. above-fold sections) and plays immediately.
 * That way headers don't "despawn" if hydration happens with the section
 * already on-screen — the IO would never fire in that case.
 *
 * lifted from portfolio-temp + hardened for SSR-paint cases.
 */
type Props = {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  ease?: string;
  className?: string;
  /** play on mount, skip the IO entirely */
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

    // if the node is already (mostly) in the viewport at mount, fire now
    const rect = node.getBoundingClientRect();
    const vh = window.innerHeight || 800;
    const alreadyVisible = rect.top < vh * 0.9 && rect.bottom > 0;
    if (alreadyVisible) {
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
      { rootMargin: "0px 0px -5% 0px", threshold: 0.01 },
    );
    io.observe(node);

    // safety: if IO somehow never fires (rare), force play after 3s so
    // the header never stays invisible forever
    const safety = window.setTimeout(play, 3000);

    return () => {
      io.disconnect();
      window.clearTimeout(safety);
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
