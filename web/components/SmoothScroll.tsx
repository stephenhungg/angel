"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

/**
 * SmoothScroll — wraps the page in lenis-driven smooth scroll, syncs gsap's
 * ScrollTrigger to lenis's scroll value so any scroll-linked tweens stay in
 * sync with the smoothed scroll position.
 *
 * pattern: github.com/darkroomengineering/lenis (the de facto smooth-scroll
 * lib for gsap-coded landing sites). uses requestAnimationFrame ticker.
 */
export function SmoothScroll() {
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.15,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), // expoOut feel
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 1.4,
    });

    // sync gsap ScrollTrigger to lenis scroll value
    lenis.on("scroll", ScrollTrigger.update);

    // drive lenis from gsap's RAF ticker so everything is in lock-step
    gsap.ticker.add((time) => {
      lenis.raf(time * 1000);
    });
    gsap.ticker.lagSmoothing(0);

    return () => {
      lenis.destroy();
    };
  }, []);

  return null;
}
