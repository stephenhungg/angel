import Image from "next/image";
import { Reveal } from "./Reveal";
import { MaskedLine } from "./MaskedLine";
import { TiltedCard } from "./TiltedCard";
import { SparkleField } from "./SparkleField";
import { CuteAccent } from "./CuteAccent";

// section 04 — "her hours" — kawaii mascot variants showing what she did while
// you were away. each card is a transparent sticker pose + a small activity
// label. replaces the stock-photo placeholders entirely.

const scenes = [
  { title: "while you slept",     meta: "afk · 3:42 AM",        asset: "/kawaii/mascot-sleep-t.png" },
  { title: "deep work",           meta: "main · pr #142",       asset: "/kawaii/mascot-desk-t.png" },
  { title: "reading your codebase", meta: "files indexed · 412", asset: "/kawaii/mascot-read-t.png" },
  { title: "stretching at sunrise", meta: "warmup · 6:08 AM",   asset: "/kawaii/mascot-stretch-t.png" },
];

export function Showcase() {
  return (
    <section
      className="relative overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse at 70% 0%, #ffd9e6 0%, #fff5fa 55%, #ffffff 100%)",
      }}
    >
      <SparkleField variant="ambient" density={28} />
      <CuteAccent kind="moon"    size={140} rotate={-10} top="60px"    left="4%"  opacity={0.9} />
      <CuteAccent kind="blossom" size={120} rotate={14}  bottom="14%"  right="4%" opacity={0.92} />
      <CuteAccent kind="hearts"  size={100} rotate={-6}  top="42%"     right="6%" opacity={0.8} />

      <div className="gutter relative pt-[140px] pb-[120px] tablet:pt-[180px]">
        <MaskedLine duration={1} ease="expo.out">
          <h2 className="m-0 max-w-[820px] font-bagel text-[44px] font-normal leading-[1.05] tracking-[-0.01em] text-ink-near tablet:text-[64px] desktop:text-[80px]">
            her hours, while you were away.
          </h2>
        </MaskedLine>

        <ul className="mt-16 grid grid-cols-1 gap-10 tablet:grid-cols-2 tablet:gap-12 desktop:grid-cols-4 desktop:gap-10">
          {scenes.map((s, i) => (
            <Reveal as="li" key={s.title} delay={i * 0.08}>
              <article className="flex h-full flex-col items-start gap-5">
                <div className="relative aspect-square w-full">
                  <TiltedCard
                    rotateAmplitude={10}
                    scaleOnHover={1.04}
                    showTooltip
                    captionText={s.title}
                    className="h-full w-full"
                  >
                    <Image
                      src={s.asset}
                      alt={s.title}
                      width={620}
                      height={620}
                      className="h-full w-full select-none object-contain"
                      style={{ transform: "translateZ(0)" }}
                    />
                  </TiltedCard>
                </div>
                <div className="flex w-full flex-col gap-1 px-1">
                  <h3 className="font-sans text-[20px] font-semibold tracking-[-0.01em] text-ink-near">
                    {s.title}
                  </h3>
                  <span className="font-sans text-[12px] text-muted-secondary">
                    {s.meta}
                  </span>
                </div>
              </article>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
