import { Reveal } from "./Reveal";
import { ImageCard } from "./ImageCard";
import { StockScene } from "./StockScene";

// section 04 — showcase. mirrors moment's `04 / Pexels showcase` 4-up image
// grid with one highlighted card (moment uses 'Pexels 3 - highlight' framer
// name). 4 ambient scenes, ImageCard rest scale 1.15 → hover scale 1.0
// (camera-pulls-back hover). content swap: moment's photo gallery → angel's
// 'her hours' — what she's been up to while you were away. ties to the
// always-on agents track 30% bg-autonomy criterion.

const scenes = [
  { title: "Wednesday morning", meta: "shipped 3 commits", seed: "showcase-wed" },
  { title: "deep work", meta: "PR #42 · convex schema", seed: "showcase-deep" },
  { title: "golden hour", meta: "highlight · she lingered", seed: "showcase-golden", highlight: true },
  { title: "twilight", meta: "afk, reading", seed: "showcase-twilight" },
];

export function Showcase() {
  return (
    <section className="gutter relative pt-[160px] pb-[60px] tablet:pt-[200px]">
      {/* matches moment h2 ground-truth: 64px / Manrope 600 / lineHeight 1.2 /
          margin 0 / max-width 560px / color black */}
      <Reveal>
        <h2 className="m-0 max-w-[560px] font-sans text-[48px] font-semibold leading-[1.2] tracking-[-0.02em] text-ink-primary tablet:text-[56px] desktop:text-[64px]">
          her hours — while you were away.
        </h2>
      </Reveal>

      <div className="mt-16" />

      {/* 4-up grid w/ one highlighted (taller) card. on tablet+, the highlight
          spans 2 rows for the cinematic moment-style emphasis. */}
      <ul className="grid auto-rows-[280px] grid-cols-1 gap-4 tablet:grid-cols-2 tablet:gap-5 desktop:grid-cols-4 desktop:auto-rows-[360px] desktop:gap-6">
        {scenes.map((s, i) => (
          <Reveal
            as="li"
            key={s.title}
            delay={i * 0.1}
            className={s.highlight ? "tablet:row-span-2 desktop:row-span-1 desktop:col-span-2" : ""}
          >
            <ImageCard className="relative h-full w-full rounded-sm">
              <StockScene seed={s.seed} w={800} h={600} className="absolute inset-0" />
              <div
                aria-hidden
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(6,6,6,0) 50%, rgba(6,6,6,0.55) 100%)",
                }}
              />
              <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-3">
                <h3 className="font-sans text-[24px] font-medium leading-tight tracking-[-0.01em] text-cloud tablet:text-[28px]">
                  {s.title}
                </h3>
                <span className="font-mono text-[11px] text-cloud opacity-80">
                  {s.meta}
                </span>
              </div>
            </ImageCard>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}
