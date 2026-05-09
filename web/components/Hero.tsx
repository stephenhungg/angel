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
import { Reveal } from "./Reveal";
import { ImageCard } from "./ImageCard";
import { Crosshair, Snow } from "./Decor";
import { StockScene } from "./StockScene";

/**
 * hero — full-bleed cinematic scene with the wordmark overlaid bottom-left.
 *
 * matches moment.framer.photos's home-fold lockup exactly: dark/warm scene
 * fills viewport, giant wordmark sits in lower portion, corner registration
 * marks (crosshair on each corner), tech metadata in fragment mono in the
 * lower-corners, and a small sub-preview ImageCard floating top-right.
 *
 * motion choreography (verified against /reference/moment/motion-spec.md):
 *
 *   1. ENTRANCE: opacity 0.001 → 1 spring bounce 0.2 dur 1.2s
 *      + scene scale 1.1 → 1 over 3s ease [0,0,0,1] delay 0.4s
 *   2. SCROLL-LINKED: scene translateY = scrollY * 0.5 (parallax)
 *      + scene scale 1 → 1.1 over first 1200px (clamped)
 *   3. AMBIENT: Snow grain overlay at 0.07 opacity
 *
 * the hero scene + wordmark live in the SAME full-bleed container with no
 * gutter padding so it fills the canvas like moment. follow-up content
 * (tagline + metadata list) lives in a second gutter-padded block below.
 */
export function Hero() {
  const reducedMotion = useReducedMotion();

  const entranceScale = useMotionValue(reducedMotion ? 1 : 1.1);
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
      {/* full-bleed cinematic scene with wordmark overlay */}
      <Reveal
        scaleFrom={1}
        transition={{ duration: 1.2, ease: [0, 0, 0, 1] }}
        className="relative h-[88vh] min-h-[640px] w-full overflow-hidden"
      >
        {/* the moving scene layer (parallax + scroll-zoom) — stock photo with
            warm-monochrome sepia filter + dark bottom scrim for label legibility. */}
        <motion.div
          className="absolute inset-0"
          style={{
            y: reducedMotion ? 0 : scrollOffsetY,
            scale: reducedMotion ? 1 : sceneScale,
          }}
        >
          <StockScene seed="angel-hero-room" w={1600} h={1000} className="absolute inset-0" />
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, rgba(255,79,139,0) 30%, rgba(110,26,58,0.55) 100%)",
            }}
          />
        </motion.div>

        {/* corner registration marks — moment's signature visual */}
        <Crosshair className="absolute left-6 top-6 h-3 w-3 text-cloud opacity-50 tablet:left-10 tablet:top-10 tablet:h-4 tablet:w-4 desktop:left-[100px] desktop:top-[100px]" />
        <Crosshair className="absolute right-6 top-6 h-3 w-3 text-cloud opacity-50 tablet:right-10 tablet:top-10 tablet:h-4 tablet:w-4 desktop:right-[100px] desktop:top-[100px]" />
        <Crosshair className="absolute left-6 bottom-6 h-3 w-3 text-cloud opacity-50 tablet:left-10 tablet:bottom-10 tablet:h-4 tablet:w-4 desktop:left-[100px] desktop:bottom-[100px]" />
        <Crosshair className="absolute right-6 bottom-6 h-3 w-3 text-cloud opacity-50 tablet:right-10 tablet:bottom-10 tablet:h-4 tablet:w-4 desktop:right-[100px] desktop:bottom-[100px]" />
        <div className="pointer-events-none absolute right-6 top-1/2 -translate-y-1/2 text-cloud opacity-40 tablet:right-10 desktop:right-[100px]">
          <Snow className="h-7 w-7 tablet:h-10 tablet:w-10" />
        </div>

        {/* sub-preview ImageCard top-right — moment puts a small floating
            preview card here. on desktop only. */}
        <Reveal
          delay={0.8}
          duration={1.4}
          className="absolute right-6 top-1/4 hidden w-[180px] tablet:right-10 tablet:block tablet:w-[220px] desktop:right-[140px] desktop:w-[260px]"
        >
          <ImageCard className="aspect-[4/3] rounded-sm shadow-2xl">
            <StockScene seed="angel-room-preview" w={520} h={390} className="absolute inset-0" />
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(180deg, rgba(255,79,139,0) 50%, rgba(110,26,58,0.55) 100%)",
              }}
            />
            <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between font-mono text-[9px] uppercase tracking-[0.1em] text-cloud opacity-95">
              <span>her room</span>
              <span>now</span>
            </div>
          </ImageCard>
        </Reveal>

        {/* wordmark + byline — bottom-left, tight column, sized to match moment's
            ~140px wordmark not my old 240px (which crowded the byline). */}
        <div className="absolute bottom-[120px] left-6 tablet:bottom-[140px] tablet:left-10 desktop:bottom-[160px] desktop:left-[100px]">
          <Reveal as="header" immediate className="flex flex-col items-start gap-3">
            {/* kawaii sticker wordmark — primary hero element. replaces the
                Manrope text "angel" entirely. h1 wraps the img for SEO/a11y. */}
            <h1 className="m-0">
              <img
                src="/kawaii/wordmark-pink-nano.png"
                alt="angel"
                className="h-[200px] w-auto select-none tablet:h-[300px] desktop:h-[380px]"
                style={{
                  filter: "drop-shadow(0 8px 0 rgba(199, 62, 115, 0.5))",
                }}
              />
            </h1>
            <Reveal delay={0.6} duration={1.4}>
              {/* matches moment 'By Henry Kerrigan' byline: 12px Manrope 400 lineHeight normal */}
              <p
                className="pl-[10px] font-sans text-[12px] font-normal text-paper opacity-95"
                style={{ lineHeight: "normal" }}
              >
                By Stephen Hung &amp; Matthew · 天使
              </p>
            </Reveal>
          </Reveal>
        </div>

        {/* 3-column technical metadata — mirrors moment's bottom strip exactly:
            left = subject meta, center = lens/system meta, right = primary cta pill */}
        <div className="absolute bottom-6 left-6 right-6 hidden items-end justify-between gap-6 font-mono text-[10px] uppercase tracking-[0.12em] text-cloud opacity-70 tablet:flex tablet:bottom-10 tablet:left-10 tablet:right-10 tablet:text-[11px] desktop:bottom-[40px] desktop:left-[100px] desktop:right-[100px]">
          <div className="flex flex-col gap-1">
            <span>her room · 1440 × 900</span>
            <span>cloud-resident</span>
          </div>
          <div className="hidden flex-col gap-1 desktop:flex">
            <span>sonnet 4.6 · nia · convex</span>
            <span>768d / always-on</span>
          </div>
          <a
            href="/discover"
            className="inline-flex h-9 items-center gap-2 rounded-pill bg-cloud px-4 font-sans text-[12px] font-semibold tracking-[-0.005em] text-ink-primary transition-colors duration-200 ease-linear hover:bg-soft tablet:h-10 tablet:px-5"
          >
            <span>begin discovery</span>
            <span aria-hidden>→</span>
          </a>
        </div>

        {/* Snow grain overlay — fractal noise svg, mix-blend-overlay 7% */}
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
      </Reveal>

      {/* subtitle + metadata list — gutter-padded block under the hero scene */}
      <div className="gutter relative pb-[40px] pt-[60px] tablet:pb-[60px] tablet:pt-[80px]">
        <Reveal delay={0.2} duration={1.4}>
          <p className="max-w-[640px] font-sans text-[18px] leading-[1.5] text-muted-deep tablet:text-[20px]">
            a presence, not an app. discovered through choice, not designed through prompts.
            she remembers you across sessions, lives on your machine, and ships your code by
            walking to the desk.
          </p>
        </Reveal>

        <Reveal delay={0.5} duration={1.4}>
          <ul className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[12px] uppercase tracking-[0.06em] text-muted-secondary">
            <li>768d persona vector</li>
            <li className="hidden tablet:block" aria-hidden>
              ·
            </li>
            <li>sonnet 4.6 orchestrator</li>
            <li className="hidden tablet:block" aria-hidden>
              ·
            </li>
            <li>nia memory</li>
            <li className="hidden tablet:block" aria-hidden>
              ·
            </li>
            <li>convex realtime</li>
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
