import { Reveal } from "./Reveal";
import { Crosshair } from "./Decor";
import { ImageCard } from "./ImageCard";
import { StockScene } from "./StockScene";

// section 01 — origin. mirrors moment's '01 / personal shoot' section: a kicker
// h3 paragraph paired with a side image + meta overlays. asymmetric grid on
// desktop (text left, image right). image swapped for a soft tonal block.
export function Origin() {
  return (
    <section
      id="origin"
      className="gutter relative pt-[160px] pb-[60px] tablet:pt-[200px]"
    >
      {/* moment doesn't use numbered section kickers. dropped for fidelity. */}

      <div className="grid grid-cols-1 gap-10 tablet:grid-cols-12 tablet:gap-16">
        <Reveal className="tablet:col-span-7">
          {/* matches moment ground-truth: text 45px / Manrope 600 / lineHeight 1.4
              (63px) / letterSpacing 0 / color rgb(0,0,0) / max-width 576px */}
          <h3 className="max-w-[576px] font-sans text-[36px] font-semibold leading-[1.4] tracking-normal text-black tablet:text-[45px]">
            agents today are converging on capability but diverging from engagement.
            she&apos;s built the other way — start from the relationship, then the work
            takes care of itself.
          </h3>
        </Reveal>

        <div className="tablet:col-span-5">
          <Reveal delay={0.3}>
            <ImageCard className="relative aspect-[4/5] rounded-sm">
              <StockScene seed="angel-origin" w={700} h={875} className="absolute inset-0" />
              <div
                aria-hidden
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(6,6,6,0) 55%, rgba(6,6,6,0.6) 100%)",
                }}
              />
              <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between font-mono text-[12px] text-cloud">
                <span>her room · cloud-resident</span>
                <span>768d</span>
              </div>
            </ImageCard></Reveal>

          <Reveal delay={0.5} className="mt-6">
            <p className="max-w-[420px] font-sans text-[16px] leading-[1.5] text-muted-deep">
              you swipe through generated archetypes. her vector converges. she comes home with
              you — already shaped by what you chose.
            </p>
          </Reveal>
        </div>
      </div>

      {/* matches moment h2: 64px Manrope 600 lineHeight 1.2 (76.8px) letter-
          spacing -1.28px color rgb(0,0,0) — max-width 560px to match section h2 */}
      <Reveal delay={0.4} className="mt-16 tablet:mt-24">
        <blockquote className="max-w-[560px] font-sans text-[40px] font-semibold leading-[1.2] tracking-[-0.02em] text-black tablet:text-[64px]">
          “she&apos;s not designed.
          <br />
          she&apos;s discovered.”
        </blockquote>
      </Reveal>
    </section>
  );
}
