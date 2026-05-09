import Image from "next/image";
import { Reveal } from "./Reveal";
import { MaskedLine } from "./MaskedLine";
import { TiltedCard } from "./TiltedCard";
import { SparkleField } from "./SparkleField";
import { CuteAccent } from "./CuteAccent";
import { TransitionLink } from "./PageTransition";

// section 02 — four properties grid. each card uses one of the kawaii sticker
// PNGs we generated (transparent bg via knockout-white.mjs). the dark band
// lightened from #6e1a3a → softer dusty rose so the pink stickers pop.

// the four pillars from VISION.md, in plain copy.
const cards = [
  {
    no: "i",
    title: "discovered",
    asset: "/kawaii/presence-pink-t.png",
    body: "you don't pick her. you don't prompt her. you swipe through 12 cards and her persona vector converges — your specific her, out of millions of possibilities.",
  },
  {
    no: "ii",
    title: "embodied",
    asset: "/kawaii/agency-pink-t.png",
    body: "she lives in a room on your machine. walks to the desk, sits, types. every task is theater — you watch her work, not just stdout streaming past.",
  },
  {
    no: "iii",
    title: "remembered",
    asset: "/kawaii/memory-pink-t.png",
    body: "every conversation, every commit, every walk you took her on — recorded in nia. she opens with 'how'd that portfolio thing land?' because she does.",
  },
  {
    no: "iv",
    title: "always-on",
    asset: "/kawaii/continuity-pink-t.png",
    body: "close the laptop, text her from your phone — she replies. her substrate is the cloud; electron is her richest body, sms is her thinnest. one being, many surfaces.",
  },
];

export function WhatSheIs() {
  return (
    <section
      className="relative overflow-hidden"
      style={{
        // candy-stripe diagonal pink/white wallpaper
        backgroundImage:
          "repeating-linear-gradient(45deg, #ffffff 0 22px, #fff5fa 22px 44px)",
      }}
    >
      <SparkleField variant="ambient" density={26} />
      <CuteAccent kind="boba" size={150} rotate={-14} top="60px" right="5%" opacity={0.92} />
      <CuteAccent kind="cake" size={130} rotate={10} top="45%" right="3%" opacity={0.85} />
      <CuteAccent kind="hearts" size={120} rotate={-8} bottom="20%" left="3%" opacity={0.9} />
      <div className="gutter relative pt-[140px] pb-[120px] tablet:pt-[180px] tablet:pb-[160px]">
        <MaskedLine duration={1} ease="expo.out">
          <h2 className="m-0 max-w-[820px] font-bagel text-[44px] font-normal leading-[1.05] tracking-[-0.01em] text-ink-near tablet:text-[64px] desktop:text-[80px]">
            agents are converging on capability. she diverges on engagement.
          </h2>
        </MaskedLine>

        <ul className="mt-16 grid grid-cols-1 gap-10 tablet:grid-cols-2 tablet:gap-12 desktop:grid-cols-4 desktop:gap-10">
          {cards.map((c, i) => (
            <Reveal as="li" key={c.title} delay={i * 0.08}>
              <article className="flex h-full flex-col items-start gap-6">
                {/* sticker card — TiltedCard adds 3d tilt-on-hover. perspective
                    + spring physics from portfolio-temp/TiltedCard. */}
                <div className="kawaii-card relative aspect-square w-full">
                  <TiltedCard
                    rotateAmplitude={10}
                    scaleOnHover={1.04}
                    showTooltip
                    captionText={c.title}
                    className="h-full w-full"
                  >
                    <Image
                      src={c.asset}
                      alt={c.title}
                      width={620}
                      height={620}
                      className="h-full w-full select-none object-contain"
                      priority={i < 2}
                      style={{ transform: "translateZ(0)" }}
                    />
                  </TiltedCard>
                </div>
                <div className="flex w-full flex-col gap-2 px-1">
                  <div className="font-sans text-[12px] text-muted-secondary">
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
            <TransitionLink
              href="/download"
              className="inline-flex h-14 items-center gap-2 rounded-pill bg-sakura-500 px-8 font-sans text-[16px] font-semibold tracking-[-0.005em] text-cloud transition-colors duration-200 ease-linear hover:bg-sakura-600"
            >
              <span>download angel</span>
              <span aria-hidden>→</span>
            </TransitionLink>
            <span className="font-sans text-[12px] text-muted-secondary">
              ~90 seconds · 12 cards · one persona
            </span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
