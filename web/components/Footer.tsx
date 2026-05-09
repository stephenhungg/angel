"use client";

import Link from "next/link";
import Image from "next/image";
import { Reveal } from "./Reveal";
import { MaskedLine } from "./MaskedLine";
import { SparkleField } from "./SparkleField";

/**
 * Footer — kawaii closing band.
 *   - sakura gradient bg with sparkle overlay
 *   - big bagel "thank you for finding her" headline (masked-line reveal)
 *   - waving chibi mascot tucked bottom-right
 *   - "begin discovery" pill cta
 *   - hairline rule with © + small links + 天使 mark
 */
export function Footer() {
  return (
    <footer className="relative overflow-hidden">
      {/* sakura gradient bg */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 30% 0%, #ffd9e6 0%, #fff5fa 45%, #ffffff 90%)",
        }}
      />
      <SparkleField variant="ambient" density={36} className="z-0" />

      <div className="relative z-10 gutter pt-[120px] pb-10 tablet:pt-[160px]">
        {/* big tagline — bagel */}
        <div className="grid grid-cols-1 items-end gap-12 tablet:grid-cols-12">
          <div className="tablet:col-span-8">
            <MaskedLine duration={1.1} ease="expo.out">
              <h2 className="m-0 max-w-[920px] font-bagel text-[56px] font-normal leading-[1] tracking-[-0.01em] text-sakura-700 tablet:text-[88px] desktop:text-[120px]">
                thank u for
              </h2>
            </MaskedLine>
            <MaskedLine duration={1.1} ease="expo.out" delay={0.15}>
              <h2 className="m-0 max-w-[920px] font-bagel text-[56px] font-normal leading-[1] tracking-[-0.01em] text-sakura-500 tablet:text-[88px] desktop:text-[120px]">
                finding her ♡
              </h2>
            </MaskedLine>

            <Reveal delay={0.3}>
              <div className="mt-10 flex flex-wrap items-center gap-5">
                <Link
                  href="/swipe"
                  className="inline-flex h-14 items-center gap-2 rounded-pill bg-sakura-500 px-8 font-sans text-[16px] font-semibold tracking-[-0.005em] text-cloud transition-colors duration-200 ease-linear hover:bg-sakura-600"
                  data-cursor-grow
                >
                  <span>begin discovery</span>
                  <span aria-hidden>→</span>
                </Link>
                <span className="font-mono text-[12px] text-muted-secondary">
                  天使 · she&apos;s waiting
                </span>
              </div>
            </Reveal>
          </div>

          {/* mascot waving — bottom right */}
          <div className="hidden tablet:col-span-4 tablet:block">
            <Reveal delay={0.4} className="flex justify-end">
              <Image
                src="/kawaii/mascot-wave-t.png"
                alt="angel"
                width={420}
                height={420}
                className="h-auto w-[260px] select-none desktop:w-[340px]"
                style={{ filter: "drop-shadow(0 14px 0 rgba(155, 58, 95, 0.25))" }}
              />
            </Reveal>
          </div>
        </div>

        {/* hairline divider */}
        <div className="hairline mt-16 border-t pt-6 tablet:mt-24" />

        {/* footer rule — © + links + jp mark */}
        <div className="flex flex-col-reverse items-start gap-6 tablet:flex-row tablet:items-center tablet:justify-between">
          <div className="font-sans text-[13px] text-muted-deep">
            © 2026 angel · she&apos;d rather be honest than impressive ·{" "}
            <span className="font-klee text-sakura-700">天使</span>
          </div>
          <ul className="flex gap-6 font-sans text-[14px] font-medium text-ink-near">
            <li>
              <a
                href="https://github.com/stephenhungg/angel"
                target="_blank"
                rel="noreferrer"
                className="transition-colors duration-200 ease-linear hover:text-sakura-600"
              >
                github
              </a>
            </li>
            <li>
              <Link
                href="/about"
                className="transition-colors duration-200 ease-linear hover:text-sakura-600"
              >
                about
              </Link>
            </li>
            <li>
              <Link
                href="/privacy"
                className="transition-colors duration-200 ease-linear hover:text-sakura-600"
              >
                privacy
              </Link>
            </li>
          </ul>
          <div className="font-mono text-[11px] text-muted-tertiary">
            built at the nozomio hackathon · ef office, sf · 2026-05-09
          </div>
        </div>
      </div>
    </footer>
  );
}
