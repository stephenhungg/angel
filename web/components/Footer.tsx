import Link from "next/link";
import { Reveal } from "./Reveal";

// footer — DOM-driven mirror of moment's footer stack:
//   1. socials + legal strip (light bg, small text)
//   2. dark band: email lockup + giant wordmark — both on near-ink surface
//
// moment's verified ground-truth via headed playwright probe:
//   email-lockup:  45px Manrope 500 lineHeight 45px (locked = font-size, no
//                  letter-spacing, color rgb(251,251,251) — paper text on dark)
//   wordmark-h2:   160px Manrope 500 lineHeight 1.0 letterSpacing -3.2px
//                  color rgb(251,251,251) — paper text on dark
export function Footer() {
  return (
    <footer>
      {/* socials + legal strip (light bg) */}
      <div className="bg-paper">
        <div className="hairline gutter flex flex-col-reverse gap-4 border-t pt-[60px] pb-8 tablet:flex-row tablet:items-center tablet:justify-between">
          <div className="font-sans text-[12px] text-muted-tertiary">
            © 2026 angel · she&apos;d rather be honest than impressive.
          </div>
          <ul className="flex gap-6 font-sans text-[14px] font-medium text-ink-near">
            <li>
              <a
                href="https://github.com/stephenhungg/angel"
                target="_blank"
                rel="noreferrer"
                className="transition-colors duration-200 ease-linear hover:text-muted-deep"
              >
                github
              </a>
            </li>
            <li>
              <Link
                href="/about"
                className="transition-colors duration-200 ease-linear hover:text-muted-deep"
              >
                about
              </Link>
            </li>
            <li>
              <Link
                href="/privacy"
                className="transition-colors duration-200 ease-linear hover:text-muted-deep"
              >
                privacy
              </Link>
            </li>
          </ul>
        </div>
      </div>

      {/* dark band — angel pivot: deep sakura pink instead of near-ink.
          email lockup (45/500/paper) + giant closing wordmark (160/500/paper). */}
      <div className="text-paper" style={{ background: "#6e1a3a" }}>
        <div className="gutter flex flex-col gap-12 pt-[80px] pb-12 tablet:flex-row tablet:items-end tablet:justify-between">
          <Reveal>
            {/* matches moment email lockup: 45px / Manrope 500 / lineHeight
                45px (=font-size) / letterSpacing normal / color paper */}
            <Link
              href="/discover"
              className="group inline-flex items-baseline gap-3 font-sans text-[36px] font-medium tracking-normal text-paper transition-colors duration-200 ease-linear hover:text-muted-tertiary tablet:text-[45px]"
              style={{ lineHeight: "1" }}
            >
              <span>meet your angel</span>
              <span className="font-sans transition-transform duration-200 ease-linear group-hover:translate-x-1">
                →
              </span>
            </Link>
          </Reveal>

          <div className="font-mono text-[12px] uppercase tracking-[0.08em] text-muted-tertiary">
            <div>nozomio hackathon · always-on agents</div>
            <div>ef office, san francisco · 2026-05-09</div>
          </div>
        </div>

        <Reveal>
          <div className="gutter pb-[60px]">
            {/* matches moment closing wordmark: 160px / Manrope 500 / line
                height 1.0 / letterSpacing -3.2px / color paper / w-fit */}
            <h2 className="m-0 w-fit font-sans text-[100px] font-medium leading-[1] tracking-[-0.02em] text-paper tablet:text-[140px] desktop:text-[160px]">
              angel
            </h2>
          </div>
        </Reveal>
      </div>
    </footer>
  );
}
