import Link from "next/link";
import Image from "next/image";
import { Reveal } from "./Reveal";

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
    <section className="bg-soft">
      <div className="gutter pt-[140px] pb-[80px] tablet:pt-[180px]">
        <Reveal>
          <h2 className="m-0 max-w-[560px] font-sans text-[44px] font-semibold leading-[1.2] tracking-[-0.02em] text-ink-near tablet:text-[56px] desktop:text-[64px]">
            paths she could take.
          </h2>
        </Reveal>

        <ul className="mt-16 grid grid-cols-1 gap-10 tablet:grid-cols-2 tablet:gap-12">
          {archetypes.map((a, i) => (
            <Reveal as="li" key={a.title} delay={i * 0.08}>
              <article className="flex flex-col items-start gap-5">
                <div className="archetype-sticker relative w-full max-w-[560px]">
                  <Image
                    src={a.asset}
                    alt={a.title}
                    width={1024}
                    height={1024}
                    className="h-auto w-full select-none"
                  />
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
            href="/discover"
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
