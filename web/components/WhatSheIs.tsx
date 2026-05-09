import Link from "next/link";
import { Reveal } from "./Reveal";
import { ImageCard } from "./ImageCard";
import { Dot } from "./Decor";
import { StockScene } from "./StockScene";

// section 02 — dark services grid. mirrors moment's `02 / Moments I capture`
// EXACTLY: dark background (~#0a0a0a, near-ink-primary), 4-up service-card
// grid, ends with a primary cta. moment's services are 'Personal shoots /
// Campaigns / Weddings & events / Inquiries' — we swap to angel's four
// properties (presence / memory / agency / continuity) and the closing cta
// becomes 'begin discovery' (replaces the separate discover band entirely).
//
// each service card: ImageCard tonal gradient + fragment-mono kicker + Manrope
// 500 title overlay, body copy below the card. moment's exact lockup.

const cards = [
  {
    no: "i / presence",
    title: "presence",
    seed: "angel-presence",
    body: "she lives in a room on your machine. you summon her, she walks to the desk, the monitor lights up. she's not a chat — she's somewhere.",
  },
  {
    no: "ii / memory",
    title: "memory",
    seed: "angel-memory",
    body: "every conversation, every commit, every walk you took her on — recorded in nia. she opens with 'how'd that portfolio thing land?' because she remembers.",
  },
  {
    no: "iii / agency",
    title: "agency",
    seed: "angel-agency",
    body: "she ships your code. claude sonnet 4.6 orchestrates, codex executes, a verifier confirms. she narrates honestly — including when she fails.",
  },
  {
    no: "iv / continuity",
    title: "continuity",
    seed: "angel-continuity",
    body: "close the laptop, text her from your phone — she replies. her substrate is the cloud; the room and the sms are surfaces. one being, many bodies.",
  },
];

export function WhatSheIs() {
  return (
    <section
      className="text-paper"
      style={{ background: "#6e1a3a" }}
    >
      <div className="gutter pt-[160px] pb-[120px] tablet:pt-[200px] tablet:pb-[160px]">
        {/* moment puts h2 alone — no preceding kicker; dropped for fidelity. */}

        {/* matches moment h2 ground-truth: 64px / Manrope 600 / lineHeight 1.2
            (76.8px) / letterSpacing -1.28px / margin 0 / max-width 560px */}
        <Reveal>
          <h2 className="m-0 max-w-[560px] font-sans text-[48px] font-semibold leading-[1.2] tracking-[-0.02em] tablet:text-[56px] desktop:text-[64px]">
            four properties no current agent has all of.
          </h2>
        </Reveal>

        <div className="mt-16" />

        <ul className="grid grid-cols-1 gap-6 tablet:grid-cols-2 desktop:grid-cols-4 desktop:gap-8">
          {cards.map((c, i) => (
            <Reveal as="li" key={c.title} delay={i * 0.1}>
              <article className="flex h-full flex-col gap-5">
                <ImageCard className="relative aspect-[4/5] rounded-sm">
                  <StockScene seed={c.seed} w={620} h={780} className="absolute inset-0" />
                  <div
                    aria-hidden
                    className="absolute inset-0"
                    style={{
                      background:
                        "linear-gradient(180deg, rgba(6,6,6,0) 0%, rgba(6,6,6,0) 55%, rgba(6,6,6,0.65) 100%)",
                    }}
                  />
                  <div className="absolute left-4 top-4 font-mono text-[10px] uppercase tracking-[0.12em] text-cloud opacity-90">
                    {c.no}
                  </div>
                  <div className="absolute bottom-4 left-4 right-4">
                    <h3 className="font-sans text-[28px] font-medium leading-tight tracking-[-0.01em] text-cloud tablet:text-[32px]">
                      {c.title}
                    </h3>
                    <div className="mt-1 font-mono text-[11px] uppercase tracking-[0.08em] text-cloud opacity-70">
                      a property of her
                    </div>
                  </div>
                </ImageCard>
                <p className="font-sans text-[15px] leading-[1.55] text-muted-tertiary">
                  {c.body}
                </p>
              </article>
            </Reveal>
          ))}
        </ul>

        {/* services grid closing cta — moment lands an 'Inquiries' card or a
            primary cta here. we point to /discover and absorb the dark-band
            cta entirely. */}
        <Reveal delay={0.3}>
          <div className="mt-16 flex flex-wrap items-center gap-6 tablet:mt-24">
            <Link
              href="/discover"
              className="inline-flex h-14 items-center rounded-pill bg-paper px-8 font-sans text-[16px] font-semibold tracking-[-0.005em] text-ink-primary transition-colors duration-200 ease-linear hover:bg-soft"
            >
              begin discovery
            </Link>
            <span className="font-mono text-[12px] uppercase tracking-[0.08em] text-muted-tertiary">
              ~90 seconds · 12 cards · one persona
            </span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
