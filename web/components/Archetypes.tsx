import Link from "next/link";
import Image from "next/image";
import { Reveal } from "./Reveal";
import { MaskedLine } from "./MaskedLine";
import { TiltedCard } from "./TiltedCard";
import { SparkleField } from "./SparkleField";
import { CuteAccent } from "./CuteAccent";

// "memories"-style 2x2 gallery — each card is one of the 4 archetype kawaii
// stickers (soft / warm / deep / quiet). transparent bg sits on the soft pink
// section surface. each card has a meta line beneath in muted pink.

const archetypes = [
  { title: "soft",  meta: "morning haze",  asset: "/kawaii/archetype-soft-t.png" },
  { title: "warm",  meta: "golden hour",   asset: "/kawaii/archetype-warm-t.png" },
  { title: "deep",  meta: "study lamp",    asset: "/kawaii/archetype-deep-t.png" },
  { title: "quiet", meta: "twilight",      asset: "/kawaii/archetype-quiet-t.png" },
];

export function Archetypes() {
  return (
    <section
      className="relative overflow-hidden"
      style={{
        // softer candy-stripe — vertical, lower contrast
        backgroundImage:
          "repeating-linear-gradient(0deg, #fff5fa 0 32px, #ffffff 32px 64px)",
      }}
    >
      <SparkleField variant="ambient" density={32} />
      {/* cute floating accents — sit in negative space around the section */}
      <CuteAccent kind="bow" size={140} rotate={-12} top="80px" right="6%" opacity={0.95} />
      <CuteAccent kind="strawberry" size={110} rotate={18} top="40%" left="3%" opacity={0.9} />
      <CuteAccent kind="cloud" size={170} rotate={-6} bottom="18%" right="4%" opacity={0.85} />
      <div className="gutter relative pt-[140px] pb-[80px] tablet:pt-[180px]">
        <MaskedLine duration={1} ease="expo.out">
          <h2 className="m-0 max-w-[820px] font-bagel text-[44px] font-normal leading-[1.05] tracking-[-0.01em] text-ink-near tablet:text-[64px] desktop:text-[80px]">
            paths she could take.
          </h2>
        </MaskedLine>

        <ul className="mt-16 grid grid-cols-1 gap-10 tablet:grid-cols-2 tablet:gap-12">
          {archetypes.map((a, i) => (
            <Reveal as="li" key={a.title} delay={i * 0.08}>
              <article className="flex flex-col items-start gap-5">
                <div className="archetype-sticker relative aspect-square w-full max-w-[560px]" data-cursor-grow>
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
                  <h3 className="font-sans text-[28px] font-medium leading-tight tracking-[-0.015em] text-ink-near tablet:text-[32px]">
                    {a.title}
                  </h3>
                  <span className="font-mono text-[12px] text-muted-secondary">
                    {a.meta}
                  </span>
                </div>
              </article>
            </Reveal>
          ))}
        </ul>

        <Reveal delay={0.3} className="mt-16 tablet:mt-20">
          <Link
            href="/swipe"
            className="group inline-flex items-baseline gap-3 font-sans text-[20px] font-medium tracking-[-0.005em] text-ink-near transition-colors duration-200 ease-linear hover:text-sakura-600"
          >
            <span>explore all paths</span>
            <span className="transition-transform duration-200 ease-linear group-hover:translate-x-1">
              →
            </span>
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
