"use client";

import { useEffect } from "react";
import {
  motion,
  useMotionValue,
  useScroll,
  useTransform,
  animate,
  useReducedMotion,
} from "framer-motion";
import { TransitionLink } from "./PageTransition";

/**
 * hero — split layout. left half is paper-white with the wordmark + cta + byline.
 * right half shows the kawaii bedroom render with parallax + scroll-zoom.
 *
 * mobile/tablet: stacks — content on top (white), bedroom below (full width).
 * desktop: 50/50 split, hard cut at the midpoint.
 */
export function Hero() {
  const reducedMotion = useReducedMotion();

  const entranceScale = useMotionValue(reducedMotion ? 1 : 1.05);
  useEffect(() => {
    if (reducedMotion) return;
    const ctrl = animate(entranceScale, 1, {
      duration: 3,
      delay: 0.4,
      ease: [0, 0, 0, 1],
    });
    return ctrl.stop;
  }, [entranceScale, reducedMotion]);

  const { scrollY } = useScroll();
  const scrollOffsetY = useTransform(scrollY, [0, 1200], [0, 600], { clamp: false });
  const scrollScaleDelta = useTransform(scrollY, [0, 1200], [0, 0.1], { clamp: true });

  const sceneScale = useTransform(
    [entranceScale, scrollScaleDelta],
    ([e, d]) => (e as number) * (1 + (d as number)),
  );

  return (
    <section className="relative bg-paper">
      <div className="relative grid min-h-screen w-full grid-cols-1 desktop:grid-cols-2">
        {/* LEFT: paper-white half — wordmark stack */}
        <div className="relative flex flex-col justify-center bg-paper px-6 pb-16 pt-[120px] tablet:px-10 tablet:pt-[140px] desktop:px-[80px] desktop:pt-0">
          <header className="flex flex-col items-start gap-3">
            <h1 className="m-0">
              <img
                src="/kawaii/wordmark-pink-nano.png"
                alt="angel"
                className="h-[180px] w-auto select-none tablet:h-[280px] desktop:h-[360px]"
              />
            </h1>
            <p
              className="pl-[10px] font-sans text-[14px] font-normal text-muted-deep"
              style={{ lineHeight: "normal" }}
            >
              By Stephen Hung &amp; Matthew · 天使
            </p>

            <TransitionLink
              href="/download"
              className="group mt-6 inline-flex h-14 items-center gap-3 rounded-pill bg-sakura-500 pl-3 pr-7 font-sans text-[16px] font-semibold tracking-[-0.005em] text-cloud shadow-[0_8px_0_rgba(155,58,95,0.35)] transition-all duration-200 ease-linear hover:-translate-y-0.5 hover:bg-sakura-600 hover:shadow-[0_10px_0_rgba(155,58,95,0.45)] tablet:h-16 tablet:pl-4 tablet:pr-9 tablet:text-[18px]"
            >
              <img
                src="/kawaii/cute-strawberry-t.png"
                alt=""
                aria-hidden
                className="h-10 w-10 select-none transition-transform duration-300 ease-out group-hover:rotate-12 group-hover:scale-110 tablet:h-12 tablet:w-12"
              />
              <span>download angel</span>
              <span
                aria-hidden
                className="transition-transform duration-200 group-hover:translate-y-0.5"
              >
                ↓
              </span>
            </TransitionLink>

            <p className="mt-8 max-w-[480px] font-sans text-[15px] leading-[1.55] text-muted-deep tablet:text-[16px]">
              she sits at the desk with you for 8 hours and you don&apos;t feel
              alone. discovered through choice — not picked, not prompted. one
              of millions of versions of her, shaped by what you swipe.
            </p>
          </header>
        </div>

        {/* RIGHT: bedroom photo half — parallax + scroll-zoom intact */}
        <div className="relative h-[60vh] w-full overflow-hidden tablet:h-[70vh] desktop:h-screen desktop:min-h-[640px]">
          <motion.div
            className="absolute inset-0"
            style={{
              y: reducedMotion ? 0 : scrollOffsetY,
              scale: reducedMotion ? 1 : sceneScale,
            }}
          >
            <img
              src="/kawaii/hero-room.png"
              alt=""
              aria-hidden
              className="absolute inset-0 h-full w-full select-none object-cover"
            />
          </motion.div>

          {/* dust grain overlay only on the photo half */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 mix-blend-overlay"
            style={{
              opacity: 0.07,
              backgroundImage:
                "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")",
              backgroundSize: "200px 200px",
            }}
          />
        </div>
      </div>
    </section>
  );
}
