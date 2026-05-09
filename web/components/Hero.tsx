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
import { Crosshair, Snow } from "./Decor";

/**
 * hero — angel's full-bleed cinematic scene.
 *
 * INTRO CHOREOGRAPHY (driven by BaitIntro's master gsap timeline after the
 * shape-overlays wipe completes — see `hero-intro-*` class hooks):
 *
 *   1. .hero-bg            — gradient + scrim fades in (1s, expoOut)
 *   2. .hero-decor         — 4 corner crosshairs pop one-by-one (stagger)
 *   3. .hero-snow          — center-right snow svg fades in
 *   4. .hero-wordmark      — kawaii sticker drops with elastic + slight rotate
 *   5. .hero-byline        — small italic byline fades up
 *   6. .hero-preview       — sub-preview card slides in from right
 *   7. .hero-meta-l/r      — fragment-mono metadata fades in left + right
 *
 * once the intro plays, the scroll-linked parallax + scroll-zoom take over.
 * intro plays on first paint OR on every page load if bait was skipped — the
 * hero must NEVER appear blank, only animate-in once.
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
    <section className="relative">
      {/* full-viewport scene — fills 100vh under the fixed nav */}
      <div className="relative h-screen min-h-[640px] w-full overflow-hidden">
        {/* moving scene layer (parallax + scroll-zoom) */}
        <motion.div
          className="hero-bg absolute inset-0"
          style={{
            y: reducedMotion ? 0 : scrollOffsetY,
            scale: reducedMotion ? 1 : sceneScale,
          }}
        >
          {/* her actual room — full-bleed kawaii bedroom render */}
          <img
            src="/kawaii/hero-room.png"
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full select-none object-cover"
          />
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, rgba(255,165,194,0) 45%, rgba(94,38,64,0.4) 100%)",
            }}
          />
        </motion.div>

        {/* corner registration marks */}
        <Crosshair className="hero-decor absolute left-6 top-6 h-3 w-3 text-cloud opacity-50 tablet:left-10 tablet:top-10 tablet:h-4 tablet:w-4 desktop:left-[100px] desktop:top-[100px]" />
        <Crosshair className="hero-decor absolute right-6 top-6 h-3 w-3 text-cloud opacity-50 tablet:right-10 tablet:top-10 tablet:h-4 tablet:w-4 desktop:right-[100px] desktop:top-[100px]" />
        <Crosshair className="hero-decor absolute left-6 bottom-6 h-3 w-3 text-cloud opacity-50 tablet:left-10 tablet:bottom-10 tablet:h-4 tablet:w-4 desktop:left-[100px] desktop:bottom-[100px]" />
        <Crosshair className="hero-decor absolute right-6 bottom-6 h-3 w-3 text-cloud opacity-50 tablet:right-10 tablet:bottom-10 tablet:h-4 tablet:w-4 desktop:right-[100px] desktop:bottom-[100px]" />

        <div className="hero-snow pointer-events-none absolute right-6 top-1/2 -translate-y-1/2 text-cloud opacity-40 tablet:right-10 desktop:right-[100px]">
          <Snow className="h-7 w-7 tablet:h-10 tablet:w-10" />
        </div>

        {/* sub-preview card removed — was a stock-image box in the upper-right */}

        {/* wordmark sticker — kawaii png, mix-blend-multiply to drop the white bg */}
        <div className="absolute bottom-[120px] left-6 tablet:bottom-[140px] tablet:left-10 desktop:bottom-[180px] desktop:left-[100px]">
          <header className="flex flex-col items-start gap-3">
            <h1 className="m-0">
              <img
                src="/kawaii/wordmark-pink-nano-t.png"
                alt="angel"
                className="hero-wordmark h-[260px] w-auto select-none tablet:h-[440px] desktop:h-[560px]"
                style={{
                  filter: "drop-shadow(0 14px 0 rgba(155, 58, 95, 0.4)) drop-shadow(0 28px 48px rgba(199, 78, 122, 0.25))",
                }}
              />
            </h1>
            <p
              className="hero-byline pl-[10px] font-sans text-[14px] font-normal text-paper"
              style={{ lineHeight: "normal" }}
            >
              By Stephen Hung &amp; Matthew · 天使
            </p>

            {/* primary download cta — pink pill on the hero */}
            <a
              href="/download"
              className="hero-cta group mt-4 inline-flex h-14 items-center gap-2 rounded-pill bg-sakura-500 px-8 font-sans text-[16px] font-semibold tracking-[-0.005em] text-cloud shadow-[0_8px_0_rgba(155,58,95,0.35)] transition-all duration-200 ease-linear hover:-translate-y-0.5 hover:bg-sakura-600 hover:shadow-[0_10px_0_rgba(155,58,95,0.45)] tablet:h-16 tablet:px-10 tablet:text-[18px]"
              data-cursor-grow
            >
              <span>download angel</span>
              <span aria-hidden className="transition-transform duration-200 group-hover:translate-y-0.5">
                ↓
              </span>
            </a>
          </header>
        </div>

        {/* technical metadata — sentence case, no caps, mono font for vibe.
            left = subject meta, right = stack line. */}
        <div className="absolute bottom-6 left-6 right-6 hidden items-end justify-between gap-6 font-sans text-[11px] text-cloud opacity-80 tablet:flex tablet:bottom-10 tablet:left-10 tablet:right-10 desktop:bottom-[40px] desktop:left-[100px] desktop:right-[100px]">
          <div className="hero-meta-l flex flex-col gap-1">
            <span>her room · 1440 × 900</span>
            <span>cloud-resident</span>
          </div>
          <div className="hero-meta-r hidden flex-col items-end gap-1 desktop:flex">
            <span>sonnet 4.6 · nia · convex</span>
            <span>768d · always-on</span>
          </div>
        </div>

        {/* dust grain overlay */}
        <div
          aria-hidden
          className="hero-grain pointer-events-none absolute inset-0 mix-blend-overlay"
          style={{
            opacity: 0.07,
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")",
            backgroundSize: "200px 200px",
          }}
        />
      </div>

      {/* below-hero subtitle + tech stack list (gutter-padded) */}
      <div className="gutter relative pb-[40px] pt-[60px] tablet:pb-[60px] tablet:pt-[80px]">
        <p className="hero-subtitle max-w-[640px] font-sans text-[18px] leading-[1.5] text-muted-deep tablet:text-[20px]">
          a presence, not an app. discovered through choice, not designed through prompts.
          she remembers you across sessions, lives on your machine, and ships your code by
          walking to the desk.
        </p>
        <ul className="hero-stack mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 font-sans text-[13px] text-muted-secondary">
          <li>768d persona vector</li>
          <li className="hidden tablet:block" aria-hidden>·</li>
          <li>sonnet 4.6 orchestrator</li>
          <li className="hidden tablet:block" aria-hidden>·</li>
          <li>nia memory</li>
          <li className="hidden tablet:block" aria-hidden>·</li>
          <li>convex realtime</li>
        </ul>
      </div>
    </section>
  );
}
