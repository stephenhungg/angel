"use client";

import { motion, type Transition } from "framer-motion";
import { useEffect, useRef, useState } from "react";

/**
 * intersection-observer-based reveal, mount-once.
 * lesson 20 from portfolio-temp: do NOT use ScrollTrigger for SSR mount-once
 * reveals — content can stay hidden if ScrollTrigger does not refresh after
 * layout settles (image loads, font swaps). intersection observer fires from
 * layout alone and is bulletproof.
 *
 * default transition matches moment.framer.photos's authored primitive:
 *   spring, bounce 0.2, duration 1.2s, opacity 0.001 → 1
 * see /Users/stephenhung/Documents/GitHub/angel/reference/moment/motion-spec.md
 */

type RevealProps = {
  children: React.ReactNode;
  /** seconds before the spring fires once in view */
  delay?: number;
  /** override duration (default 1.2s) */
  duration?: number;
  /** override transition entirely — falls through to framer-motion */
  transition?: Transition;
  /** disable the reveal — render visible immediately (for ssr-critical content) */
  immediate?: boolean;
  /** scale to enter from (moment hero image uses 1.1 → 1) */
  scaleFrom?: number;
  className?: string;
  as?: "div" | "section" | "header" | "footer" | "article" | "li";
};

export function Reveal({
  children,
  delay = 0,
  duration = 1.2,
  transition,
  immediate = false,
  scaleFrom = 1,
  className,
  as = "div",
}: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(immediate);

  useEffect(() => {
    if (immediate || shown) return;
    const node = ref.current;
    if (!node) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setShown(true);
            io.disconnect();
            break;
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.05 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [immediate, shown]);

  // spring with bounce 0.2 is moment's authored primitive (28 of ~38 transitions)
  const t: Transition = transition ?? {
    type: "spring",
    bounce: 0.2,
    duration,
    delay,
  };

  const MotionTag = motion[as] as typeof motion.div;

  return (
    <MotionTag
      ref={ref as never}
      initial={{ opacity: 0.001, scale: scaleFrom }}
      animate={shown ? { opacity: 1, scale: 1 } : { opacity: 0.001, scale: scaleFrom }}
      transition={t}
      className={className}
    >
      {children}
    </MotionTag>
  );
}
