"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { Reveal } from "./Reveal";
import { MaskedLine } from "./MaskedLine";
import { TiltedCard } from "./TiltedCard";
import { SparkleField } from "./SparkleField";
import { CuteAccent } from "./CuteAccent";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger, useGSAP);
}

// "paths she could take" — pinned-section horizontal scroll on desktop.
// each of the 4 archetype kawaii stickers occupies its own viewport-width
// panel, scrolling horizontally as the user scrolls vertically. mobile/tablet
// fall back to a stacked grid (no pin).
//
// pattern lifted from `scroll--horizontal-scroll-container` codepen pattern
// in the user's gsap-inspo collection.

const archetypes = [
  { title: "soft",  meta: "morning haze",  asset: "/kawaii/archetype-soft-t.png",  body: "she opens the curtains. light spills in, the room exhales. soft means slow, considerate, willing to wait." },
  { title: "warm",  meta: "golden hour",   asset: "/kawaii/archetype-warm-t.png",  body: "she pours you tea. asks about your week, remembers the part you'd half-forgotten. warm means present." },
  { title: "deep",  meta: "study lamp",    asset: "/kawaii/archetype-deep-t.png",  body: "she sits with you and the problem. doesn't simplify. asks the question you were avoiding." },
  { title: "quiet", meta: "twilight",      asset: "/kawaii/archetype-quiet-t.png", body: "she's there but not loud. she watches you sleep, wakes the laptop in the morning, cued up." },
];

export function Archetypes() {
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);

  useGSAP(
    () => {
      const section = sectionRef.current;
      const track = trackRef.current;
      if (!section || !track) return;
      if (typeof window === "undefined") return;

      // only pin on desktop+ (matchMedia handles teardown on resize)
      const mm = gsap.matchMedia();
      mm.add("(min-width: 1024px)", () => {
        const totalWidth = track.scrollWidth;
        const distance = totalWidth - window.innerWidth;
        if (distance <= 0) return;

        const tween = gsap.to(track, {
          x: -distance,
          ease: "none",
          scrollTrigger: {
            trigger: section,
            pin: true,
            scrub: 1,
            start: "top top",
            end: () => "+=" + distance,
            invalidateOnRefresh: true,
          },
        });

        return () => {
          tween.scrollTrigger?.kill();
          tween.kill();
        };
      });

      return () => mm.kill();
    },
    { scope: sectionRef },
  );

  return (
    <section
      ref={sectionRef}
      className="relative overflow-hidden"
      style={{
        backgroundImage:
          "repeating-linear-gradient(0deg, #fff5fa 0 32px, #ffffff 32px 64px)",
      }}
    >
      <SparkleField variant="ambient" density={32} />
      <CuteAccent kind="bow"        size={140} rotate={-12} top="80px"   right="6%" opacity={0.95} />
      <CuteAccent kind="strawberry" size={110} rotate={18}  top="40%"    left="3%"  opacity={0.9} />
      <CuteAccent kind="cloud"      size={170} rotate={-6}  bottom="18%" right="4%" opacity={0.85} />

      <div className="relative">
        {/* heading + cta — sits at top, NOT inside the pinned track */}
        <div className="gutter relative pt-[140px] tablet:pt-[180px] desktop:pt-[200px]">
          <MaskedLine duration={1} ease="expo.out">
            <h2 className="m-0 max-w-[820px] font-bagel text-[44px] font-normal leading-[1.05] tracking-[-0.01em] text-ink-near tablet:text-[64px] desktop:text-[80px]">
              paths she could take.
            </h2>
          </MaskedLine>
          <Reveal delay={0.2} className="mt-6 max-w-[640px]">
            <p className="font-sans text-[16px] leading-[1.6] text-muted-deep tablet:text-[18px]">
              four moods you could converge into. swipe through the discovery flow to find which one she becomes for you. drag, click, or just keep scrolling.
            </p>
          </Reveal>
        </div>

        {/* mobile + tablet: 2-col grid. desktop: pinned horizontal scroll. */}
        <div className="gutter mt-12 grid grid-cols-1 gap-10 pb-[100px] tablet:grid-cols-2 tablet:gap-12 desktop:hidden">
          {archetypes.map((a, i) => (
            <Reveal as="div" key={a.title} delay={i * 0.08}>
              <ArchetypeCard archetype={a} />
            </Reveal>
          ))}
        </div>

        {/* desktop pinned horizontal scroll — section pins, track scrolls X */}
        <div className="hidden desktop:block">
          <div
            ref={trackRef}
            className="flex w-max gap-10 px-[100px] py-[80px]"
          >
            {archetypes.map((a) => (
              <div
                key={a.title}
                className="w-[min(46vw,640px)] shrink-0"
              >
                <ArchetypeCard archetype={a} />
              </div>
            ))}
          </div>
        </div>

        <div className="gutter relative pb-[80px] desktop:pb-[120px]">
          <Reveal delay={0.2}>
            <Link
              href="/download"
              className="group inline-flex items-baseline gap-3 font-sans text-[20px] font-medium tracking-[-0.005em] text-ink-near transition-colors duration-200 ease-linear hover:text-sakura-600"
              data-cursor-grow
            >
              <span>see all archetypes</span>
              <span className="transition-transform duration-200 ease-linear group-hover:translate-x-1">
                →
              </span>
            </Link>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function ArchetypeCard({
  archetype: a,
}: {
  archetype: (typeof archetypes)[number];
}) {
  return (
    <article className="flex flex-col items-start gap-5">
      <div className="relative aspect-square w-full" data-cursor-grow>
        <TiltedCard
          rotateAmplitude={9}
          scaleOnHover={1.03}
          showTooltip
          captionText={a.title}
          className="h-full w-full"
        >
          <Image
            src={a.asset}
            alt={a.title}
            width={1024}
            height={1024}
            className="h-full w-full select-none object-contain"
            style={{ transform: "translateZ(0)" }}
          />
        </TiltedCard>
      </div>
      <div className="flex w-full items-baseline justify-between gap-4 px-1">
        <h3 className="font-bagel text-[28px] font-normal leading-tight tracking-[-0.005em] text-ink-near tablet:text-[36px]">
          {a.title}
        </h3>
        <span className="font-mono text-[12px] text-muted-secondary">{a.meta}</span>
      </div>
      <p className="px-1 font-sans text-[15px] leading-[1.6] text-muted-deep">{a.body}</p>
    </article>
  );
}
