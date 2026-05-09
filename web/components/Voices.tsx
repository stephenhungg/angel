"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { Reveal } from "./Reveal";

// section 03 — voices. mirrors moment's `03 / Memories` testimonial:
// ONE giant word-by-word animated quote with author lockup (image + name +
// affiliation). moment uses "I usually hate getting my photo taken, but this
// felt totally different…" — single quote, no supporting grid.
//
// for fidelity we keep that exact structure: one big WordStagger pull quote +
// author byline beneath. no supporting quote grid.

const lead = "i usually don't trust ai. she felt different.";

function WordStagger({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });

  return (
    <div ref={ref} className="flex flex-wrap gap-x-3 gap-y-2 tablet:gap-x-4">
      {text.split(" ").map((w, i) => (
        <motion.span
          key={`${w}-${i}`}
          initial={{ opacity: 0.001, y: 12 }}
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0.001, y: 12 }}
          transition={{
            type: "spring",
            bounce: 0.2,
            duration: 1.2,
            delay: i * 0.06,
          }}
          className="inline-block font-sans text-[40px] font-semibold leading-[1.2] tracking-[-0.02em] text-ink-primary tablet:text-[56px] desktop:text-[64px]"
        >
          {w}
        </motion.span>
      ))}
    </div>
  );
}

export function Voices() {
  return (
    <section
      id="voices"
      className="gutter relative pt-[160px] pb-[60px] tablet:pt-[200px]"
    >
      {/* matches moment 'Memories' h2: 64px Manrope 600 lineHeight 1.2 letter-
          spacing -1.28px color #060606 max-w 560px margin 0 (sibling spacing) */}
      <Reveal>
        <h2 className="m-0 max-w-[560px] font-sans text-[48px] font-semibold leading-[1.2] tracking-[-0.02em] text-ink-primary tablet:text-[56px] desktop:text-[64px]">
          memories
        </h2>
      </Reveal>

      <div className="mt-16" />

      <WordStagger text={lead} />

      {/* author lockup — small avatar block + byline. matches moment's
          'Testimonial author + image + shooting location' framer name. */}
      <Reveal delay={0.5} className="mt-12 flex items-center gap-4 tablet:mt-16">
        <div className="h-14 w-14 overflow-hidden rounded-full">
          <img
            src="https://picsum.photos/seed/voices-author/120/120"
            alt=""
            aria-hidden
            className="h-full w-full object-cover"
            style={{ filter: "sepia(0.5) saturate(1.2) brightness(0.9)" }}
          />
        </div>
        <div className="flex flex-col">
          <div className="font-sans text-[16px] font-medium tracking-[-0.005em] text-ink-near">
            anonymous, early access
          </div>
          <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-secondary">
            Berkeley, CA · 2026-04
          </div>
        </div>
      </Reveal>
    </section>
  );
}
