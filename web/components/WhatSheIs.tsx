import Link from "next/link";
import Image from "next/image";
import { Reveal } from "./Reveal";

// section 02 — four properties grid. each card uses one of the kawaii sticker
// PNGs we generated (transparent bg via knockout-white.mjs). the dark band
// lightened from #6e1a3a → softer dusty rose so the pink stickers pop.

const cards = [
  {
    no: "i",
    title: "presence",
    asset: "/kawaii/presence-pink-t.png",
    body: "she lives in a room on your machine. you summon her, she walks to the desk, the monitor lights up. she's not a chat — she's somewhere.",
  },
  {
    no: "ii",
    title: "memory",
    asset: "/kawaii/memory-pink-t.png",
    body: "every conversation, every commit, every walk you took her on — recorded in nia. she opens with 'how'd that portfolio thing land?' because she remembers.",
  },
  {
    no: "iii",
    title: "agency",
    asset: "/kawaii/agency-pink-t.png",
    body: "she ships your code. claude sonnet 4.6 orchestrates, codex executes, a verifier confirms. she narrates honestly — including when she fails.",
  },
  {
    no: "iv",
    title: "continuity",
    asset: "/kawaii/continuity-pink-t.png",
    body: "close the laptop, text her from your phone — she replies. her substrate is the cloud; the room and the sms are surfaces. one being, many bodies.",
  },
];

export function WhatSheIs() {
  return (
    <section className="bg-paper">
      <div className="gutter pt-[140px] pb-[120px] tablet:pt-[180px] tablet:pb-[160px]">
        <Reveal>
          <h2 className="m-0 max-w-[560px] font-sans text-[44px] font-semibold leading-[1.2] tracking-[-0.02em] text-ink-near tablet:text-[56px] desktop:text-[64px]">
            four properties no current agent has all of.
          </h2>
        </Reveal>

        <ul className="mt-16 grid grid-cols-1 gap-10 tablet:grid-cols-2 tablet:gap-12 desktop:grid-cols-4 desktop:gap-10">
          {cards.map((c, i) => (
            <Reveal as="li" key={c.title} delay={i * 0.08}>
              <article className="flex h-full flex-col items-start gap-6">
                {/* sticker card — sits on the soft pink bg, transparent png */}
                <div className="kawaii-card relative w-full">
                  <Image
                    src={c.asset}
                    alt={c.title}
                    width={620}
                    height={620}
                    className="h-auto w-full select-none"
                    priority={i < 2}
                  />
                </div>
                <div className="flex w-full flex-col gap-2 px-1">
                  <div className="font-mono text-[12px] text-muted-secondary">
                    {c.no} · a property of her
                  </div>
                  <p className="font-sans text-[15px] leading-[1.6] text-muted-deep">
                    {c.body}
                  </p>
                </div>
              </article>
            </Reveal>
          ))}
        </ul>

        <Reveal delay={0.3}>
          <div className="mt-20 flex flex-wrap items-center gap-6">
            <Link
              href="/discover"
              className="inline-flex h-14 items-center gap-2 rounded-pill bg-sakura-500 px-8 font-sans text-[16px] font-semibold tracking-[-0.005em] text-cloud transition-colors duration-200 ease-linear hover:bg-sakura-600"
            >
              <span>begin discovery</span>
              <span aria-hidden>→</span>
            </Link>
            <span className="font-mono text-[12px] text-muted-secondary">
              ~90 seconds · 12 cards · one persona
            </span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
