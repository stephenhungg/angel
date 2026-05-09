"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { MaskedLine } from "./MaskedLine";
import { TransitionLink } from "./PageTransition";

// route — TransitionLink for /download (kawaii wipe), plain anchor for hashes (smooth scroll)
function SlideLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  if (href.startsWith("/")) {
    return (
      <TransitionLink href={href} className={className}>
        {children}
      </TransitionLink>
    );
  }
  return (
    <a href={href} className={className}>
      {children}
    </a>
  );
}

if (typeof window !== "undefined") {
  gsap.registerPlugin(useGSAP);
}

/**
 * Origin — about carousel. left card (kicker / headline / pull-quote+thumb /
 * read more / meta + view) on white, right portrait on the kawaii sticker.
 * Cycles through 4 slides automatically every ~7s. Drag, click prev/next,
 * or click pagination dots. Auto-pauses on hover.
 *
 * pattern adapted from the moment "personal shoot" about block in the user's
 * screenshot reference + portfolio-temp's InfiniteCarousel timing.
 */

// the four pillars from VISION.md, told as a discovery → relationship arc.
const slides = [
  {
    label: "01",
    headline: "you don't pick her. you discover her.",
    quote: "after 12 swipes, she felt like someone i'd already met.",
    quoteImg: "/kawaii/mascot-peek-t.png",
    metaLabel: "Discovery",
    metaValue: "12 swipes · 768d vector",
    viewLabel: "see the persona space",
    viewHref: "#archetypes",
    portrait: "/kawaii/presence-pink-t.png",
  },
  {
    label: "02",
    headline: "she sits at the desk. for 8 hours, you're not alone.",
    quote: "watching her walk to the desk is the first time an agent has felt like a coworker.",
    quoteImg: "/kawaii/mascot-desk-t.png",
    metaLabel: "Embodiment",
    metaValue: "electron + r3f room",
    viewLabel: "see what she does",
    viewHref: "#what-she-is",
    portrait: "/kawaii/agency-pink-t.png",
  },
  {
    label: "03",
    headline: "she remembers what you ended on.",
    quote: "she opens with the thing i was afraid to say.",
    quoteImg: "/kawaii/mascot-read-t.png",
    metaLabel: "Relationship",
    metaValue: "nia · 6-layer memory",
    viewLabel: "see how memory works",
    viewHref: "#what-she-is",
    portrait: "/kawaii/memory-pink-t.png",
  },
  {
    label: "04",
    headline: "close the laptop. she's still there.",
    quote: "i closed the laptop expecting her to die. she texted me from oslo.",
    quoteImg: "/kawaii/mascot-stretch-t.png",
    metaLabel: "Always-on",
    metaValue: "sms + cloud · one being, many bodies",
    viewLabel: "download angel",
    viewHref: "/download",
    portrait: "/kawaii/continuity-pink-t.png",
  },
];

const AUTO_MS = 7000;

export function Origin() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const portraitRef = useRef<HTMLDivElement | null>(null);

  // auto-advance
  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => {
      setActive((a) => (a + 1) % slides.length);
    }, AUTO_MS);
    return () => window.clearInterval(id);
  }, [paused]);

  // gsap fade between slides on `active` change
  useGSAP(
    () => {
      const track = trackRef.current;
      const portrait = portraitRef.current;
      if (!track || !portrait) return;

      gsap.fromTo(
        track.querySelectorAll("[data-slide-content] > *"),
        { y: 18, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.55,
          stagger: 0.05,
          ease: "expo.out",
        },
      );
      gsap.fromTo(
        portrait,
        { scale: 1.04, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.7, ease: "expo.out" },
      );
    },
    { dependencies: [active] },
  );

  const slide = slides[active];

  return (
    <section
      id="origin"
      className="relative bg-paper py-[120px] tablet:py-[160px]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="gutter">
        <MaskedLine duration={0.9} ease="expo.out">
          <h2 className="m-0 max-w-[820px] font-bagel text-[40px] font-normal leading-[1.05] tracking-[-0.01em] text-ink-near tablet:text-[56px] desktop:text-[72px]">
            about her.
          </h2>
        </MaskedLine>

        {/* the carousel — split layout: card left, portrait right */}
        <div
          ref={trackRef}
          className="mt-12 grid grid-cols-1 gap-6 desktop:grid-cols-12 desktop:gap-8"
        >
          {/* LEFT: white card */}
          <div
            data-slide-content
            className="rounded-[28px] border border-hairline bg-cloud p-8 tablet:p-12 desktop:col-span-7"
          >
            {/* kicker — bullet + label / (NN) */}
            <div className="flex items-center gap-2 font-sans text-[14px] text-ink-near">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-ink-near" />
              <span>About</span>
              <span className="text-muted-tertiary">/ ({slide.label})</span>
            </div>

            {/* headline — sans semibold, big */}
            <h3 className="mt-8 font-sans text-[36px] font-semibold leading-[1.1] tracking-[-0.02em] text-ink-near tablet:text-[52px] desktop:text-[60px]">
              {slide.headline}
            </h3>

            {/* pull-quote + tiny thumb */}
            <div className="ml-auto mt-12 flex max-w-[440px] items-start gap-4">
              <p className="flex-1 font-sans text-[15px] leading-[1.55] text-ink-near">
                <span className="text-muted-tertiary">“</span>
                {slide.quote}
                <span className="text-muted-tertiary">”</span>
              </p>
              <div className="relative h-[64px] w-[64px] shrink-0 overflow-hidden rounded-[12px] bg-soft">
                <Image
                  src={slide.quoteImg}
                  alt=""
                  width={120}
                  height={120}
                  className="h-full w-full select-none object-contain"
                />
              </div>
            </div>

            {/* read more */}
            <div className="mt-6 flex justify-end">
              <SlideLink
                href={slide.viewHref}
                className="font-sans text-[15px] font-medium text-ink-near underline underline-offset-[6px] decoration-ink-near transition-colors hover:text-sakura-600 hover:decoration-sakura-600"
              >
                Read more
              </SlideLink>
            </div>

            {/* hairline + meta */}
            <div className="mt-12 border-t border-hairline pt-6">
              <div className="flex flex-col gap-4 tablet:flex-row tablet:items-end tablet:justify-between">
                <div className="flex flex-col gap-1">
                  <span className="font-sans text-[13px] text-muted-secondary">
                    {slide.metaLabel}
                  </span>
                  <span className="font-sans text-[22px] font-medium tracking-[-0.01em] text-ink-near">
                    {slide.metaValue}
                  </span>
                </div>
                <SlideLink
                  href={slide.viewHref}
                  className="font-sans text-[15px] font-medium text-ink-near underline underline-offset-[6px] decoration-ink-near transition-colors hover:text-sakura-600 hover:decoration-sakura-600"
                >
                  {slide.viewLabel} →
                </SlideLink>
              </div>
            </div>
          </div>

          {/* RIGHT: portrait */}
          <div className="relative overflow-hidden rounded-[28px] desktop:col-span-5">
            <div
              ref={portraitRef}
              className="relative aspect-[4/5] w-full"
              style={{
                background:
                  "radial-gradient(ellipse at 30% 30%, #ffe5ee 0%, #ffd9e6 55%, #ffbcd0 100%)",
              }}
            >
              <Image
                src={slide.portrait}
                alt={slide.headline}
                width={900}
                height={1125}
                className="absolute inset-0 h-full w-full select-none object-contain p-6 tablet:p-12"
                priority={active === 0}
              />
            </div>
          </div>
        </div>

        {/* pagination + prev/next */}
        <div className="mt-10 flex items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            {slides.map((s, i) => (
              <button
                key={s.label}
                type="button"
                onClick={() => setActive(i)}
                aria-label={`go to slide ${i + 1}`}
                className={`group inline-flex items-center gap-2 transition-colors ${
                  i === active ? "text-ink-near" : "text-muted-tertiary hover:text-muted-deep"
                }`}
               
              >
                <span
                  className={`block h-[2px] transition-all duration-500 ease-out ${
                    i === active ? "w-12 bg-ink-near" : "w-6 bg-muted-tertiary"
                  }`}
                />
                <span className="font-sans text-[13px] font-medium tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setActive((a) => (a - 1 + slides.length) % slides.length)}
              aria-label="previous"
              className="flex h-12 w-12 items-center justify-center rounded-full border border-hairline bg-cloud text-ink-near transition-all duration-200 hover:border-sakura-400 hover:bg-sakura-50 hover:text-sakura-600"
             
            >
              ←
            </button>
            <button
              type="button"
              onClick={() => setActive((a) => (a + 1) % slides.length)}
              aria-label="next"
              className="flex h-12 w-12 items-center justify-center rounded-full border border-hairline bg-cloud text-ink-near transition-all duration-200 hover:border-sakura-400 hover:bg-sakura-50 hover:text-sakura-600"
             
            >
              →
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
