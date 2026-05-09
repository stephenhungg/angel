"use client";

import Image from "next/image";
import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { MaskedLine } from "./MaskedLine";
import { SparkleField } from "./SparkleField";
import { TransitionLink } from "./PageTransition";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger, useGSAP);
}

/**
 * Footer — full-viewport closing band, ported from portfolio-temp pattern.
 *
 *   min-h-screen — when you scroll all the way down it fills the viewport.
 *   flex column with justify-between → top socials, middle tagline + cta,
 *   bottom 3-col legal row, all distributed evenly across full height.
 *
 *   gsap ScrollTrigger drives parallax on the mascot + sparkle field as the
 *   user scrolls into the section, so the layers move at different speeds.
 */
export function Footer() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const mascotRef = useRef<HTMLDivElement | null>(null);
  const sparklesRef = useRef<HTMLDivElement | null>(null);
  const taglineRef = useRef<HTMLDivElement | null>(null);

  useGSAP(
    () => {
      const section = sectionRef.current;
      const mascot = mascotRef.current;
      const sparkles = sparklesRef.current;
      const tagline = taglineRef.current;
      if (!section) return;

      // mascot drifts up from below as footer enters viewport, settling at
      // its natural -translate-y-1/2 center when the footer has fully filled
      // the viewport. ends at yPercent: 0 (no residual offset = centered).
      if (mascot) {
        gsap.fromTo(
          mascot,
          { yPercent: 30 },
          {
            yPercent: 0,
            ease: "none",
            scrollTrigger: {
              trigger: section,
              start: "top bottom",
              end: "bottom bottom",
              scrub: 1,
            },
          },
        );
      }
      // sparkles drift slower than scroll, also settle at 0 when fully on-screen
      if (sparkles) {
        gsap.fromTo(
          sparkles,
          { yPercent: 40 },
          {
            yPercent: 0,
            ease: "none",
            scrollTrigger: {
              trigger: section,
              start: "top bottom",
              end: "bottom bottom",
              scrub: 1,
            },
          },
        );
      }
      if (tagline) {
        gsap.fromTo(
          tagline,
          { yPercent: 25, opacity: 0.4 },
          {
            yPercent: 0,
            opacity: 1,
            ease: "expo.out",
            scrollTrigger: {
              trigger: section,
              start: "top 75%",
              end: "top 30%",
              scrub: 1,
            },
          },
        );
      }
    },
    { scope: sectionRef },
  );

  return (
    <footer
      ref={sectionRef}
      className="relative flex min-h-screen flex-col overflow-hidden"
      style={{
        // tiled kawaii cherry pattern wallpaper, color-matched to sakura palette
        backgroundImage: "url(/kawaii/cherry-pattern.png)",
        backgroundRepeat: "repeat",
        backgroundSize: "640px auto",
      }}
    >
      {/* soft white wash so the tagline + cta read clean over the pattern */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 30% 30%, rgba(255,255,255,0.55) 0%, rgba(255,245,250,0.35) 45%, rgba(255,235,245,0.5) 100%)",
        }}
      />
      <div ref={sparklesRef} className="absolute inset-0">
        <SparkleField variant="ambient" density={48} />
      </div>

      {/* mascot anchored at ~42% (slight upper-center) so she lines up with
          the tagline area when the footer fills viewport. */}
      <div
        ref={mascotRef}
        className="pointer-events-none absolute right-[5%] top-[42%] hidden -translate-y-1/2 select-none tablet:block"
      >
        <Image
          src="/kawaii/mascot-wave-t.png"
          alt=""
          aria-hidden
          width={620}
          height={620}
          className="h-auto w-[260px] desktop:w-[380px]"
          style={{ filter: "drop-shadow(0 16px 0 rgba(155, 58, 95, 0.22))" }}
        />
      </div>

      <div className="relative z-10 flex flex-1 flex-col justify-between gutter py-10 tablet:py-14">
        {/* top row: secondary links right-aligned */}
        <div className="flex justify-end gap-6 font-sans text-[15px] font-medium text-ink-near">
          <a
            href="https://github.com/stephenhungg/angel"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 transition-colors hover:text-sakura-600"
           
          >
            github
          </a>
          <TransitionLink
            href="/download"
            className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 transition-colors hover:text-sakura-600"
          >
            download
          </TransitionLink>
        </div>

        {/* middle: big tagline + cta + status */}
        <div ref={taglineRef} className="flex flex-col gap-8 tablet:gap-12">
          <div className="max-w-4xl">
            <MaskedLine duration={1.1} ease="expo.out">
              <p className="font-bagel text-[40px] font-normal leading-[1.05] tracking-[-0.01em] text-sakura-700 tablet:text-[64px] desktop:text-[88px]">
                thank u for
              </p>
            </MaskedLine>
            <MaskedLine duration={1.1} ease="expo.out" delay={0.15}>
              <p className="font-bagel text-[40px] font-normal leading-[1.05] tracking-[-0.01em] text-sakura-500 tablet:text-[64px] desktop:text-[88px]">
                finding her ♡
              </p>
            </MaskedLine>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <TransitionLink
              href="/download"
              className="inline-flex h-14 items-center gap-2 rounded-pill bg-sakura-500 px-8 font-sans text-[16px] font-semibold tracking-[-0.005em] text-cloud transition-colors duration-200 ease-linear hover:bg-sakura-600"
            >
              <span>download angel</span>
              <span aria-hidden>↓</span>
            </TransitionLink>
            <span className="inline-flex items-center gap-2 px-3 py-4 font-sans text-[15px] text-muted-deep">
              <span className="relative inline-flex h-[7px] w-[7px]">
                <span className="absolute inset-0 animate-ping rounded-full bg-sakura-500 opacity-75" />
                <span className="relative inline-flex h-[7px] w-[7px] rounded-full bg-sakura-500" />
              </span>
              she&apos;s online
            </span>
          </div>
        </div>

        {/* bottom: 3-col row */}
        <div className="grid grid-cols-1 gap-6 font-sans text-[14px] leading-[1.5] text-muted-deep tablet:grid-cols-3 tablet:gap-10">
          <div className="flex flex-col gap-1">
            <span className="text-muted-secondary">Made with</span>
            <span className="font-medium text-ink-near">
              love · 天使 · sonnet 4.6 · convex
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-muted-secondary">Built at</span>
            <span className="font-medium text-ink-near">
              nozomio hackathon · ef office, sf
            </span>
            <span className="text-muted-tertiary">2026-05-09</span>
          </div>
          <div className="flex flex-col gap-1 tablet:items-end tablet:text-right">
            <span className="text-muted-secondary">© 2026 angel</span>
            <span className="text-muted-tertiary">
              she&apos;d rather be honest than impressive.
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
