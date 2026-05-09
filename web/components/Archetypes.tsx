import Link from "next/link";
import { Reveal } from "./Reveal";
import { ImageCard } from "./ImageCard";
import { StockScene } from "./StockScene";

// "memories" gallery list — mirrors moment's gallery-list section (2x2 of
// photo cards: Spring Bloom / Rooted Grace / Still Waters / Aroma) on a light
// background. each card has the ImageCard hover-unzoom + a Manrope title +
// 'Shot in <country>' fragment-mono meta. closes with an 'explore all' cta.
//
// content swap: moment's photo galleries → angel's archetype previews. each
// card represents one of the discoverable persona moods. tonal gradients stay
// in the cream-warm-monochrome family per moment's palette discipline.

const archetypes = [
  { title: "soft",  meta: "morning haze · pale cream", seed: "archetype-soft" },
  { title: "warm",  meta: "golden hour · amber",       seed: "archetype-warm" },
  { title: "deep",  meta: "study lamp · clay",         seed: "archetype-deep" },
  { title: "quiet", meta: "twilight · dusk",           seed: "archetype-quiet" },
];

export function Archetypes() {
  return (
    <section className="gutter relative pt-[160px] pb-[60px] tablet:pt-[200px]">
      {/* matches moment h2 ground-truth: 64px / Manrope 600 / lineHeight 1.2 /
          margin 0 / max-width 560px / color black */}
      <Reveal>
        <h2 className="m-0 max-w-[560px] font-sans text-[48px] font-semibold leading-[1.2] tracking-[-0.02em] text-black tablet:text-[56px] desktop:text-[64px]">
          paths she could take.
        </h2>
      </Reveal>

      <div className="mt-16" />

      {/* 2x2 desktop, 1-col mobile, mirroring moment's gallery list */}
      <ul className="grid grid-cols-1 gap-6 tablet:grid-cols-2 tablet:gap-8 desktop:gap-10">
        {archetypes.map((a, i) => (
          <Reveal as="li" key={a.title} delay={i * 0.1}>
            <article className="flex flex-col gap-5">
              <ImageCard className="relative aspect-[16/10] rounded-sm">
                <StockScene seed={a.seed} w={1000} h={625} className="absolute inset-0" />
                <div
                  aria-hidden
                  className="absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(180deg, rgba(6,6,6,0) 55%, rgba(6,6,6,0.55) 100%)",
                  }}
                />
              </ImageCard>
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="font-sans text-[32px] font-medium leading-tight tracking-[-0.015em] text-ink-near">
                  {a.title}
                </h3>
                <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-secondary">
                  {a.meta}
                </span>
              </div>
            </article>
          </Reveal>
        ))}
      </ul>

      {/* 'explore' cta — moment puts a similar 'View all galleries' link here */}
      <Reveal delay={0.3} className="mt-16 tablet:mt-20">
        <Link
          href="/discover"
          className="group inline-flex items-baseline gap-3 font-sans text-[20px] font-medium tracking-[-0.005em] text-ink-primary transition-colors duration-200 ease-linear hover:text-muted-deep"
        >
          <span>explore all paths</span>
          <span className="transition-transform duration-200 ease-linear group-hover:translate-x-1">
            →
          </span>
        </Link>
      </Reveal>
    </section>
  );
}
