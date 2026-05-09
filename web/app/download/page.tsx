import Link from "next/link";
import Image from "next/image";
import { InstallCommand } from "@/components/InstallCommand";

export const metadata = {
  title: "download angel",
  description: "she lives on your machine. download her.",
};

const RELEASES = "https://github.com/stephenhungg/angel/releases";
const MAC_DMG_URL =
  "https://github.com/stephenhungg/angel/releases/download/v0.0.1-alpha/Angel-0.0.1-arm64.dmg";

// inline brand-true svg icons (no emoji)
function AppleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M17.05 20.28c-.98.95-2.05.94-3.08.45-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.45C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}

function WindowsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-13.051-1.801" />
    </svg>
  );
}

// intel mac → apple logo with a small chip badge to distinguish from arm64
function AppleIntelIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M14.5 18.5c-.7.7-1.5.7-2.3.3-.8-.4-1.55-.36-2.42 0-1.07.46-1.64.33-2.28-.34C3.85 14.74 4.4 9 8.55 8.79c1.01.05 1.71.55 2.3.6.88-.18 1.72-.7 2.66-.63 1.13.09 1.98.54 2.54 1.35-2.33 1.4-1.78 4.46.36 5.32-.43 1.12-.98 2.23-1.91 3.07zM10.84 8.74c-.11-1.66 1.24-3.04 2.79-3.17.22 1.93-1.74 3.36-2.79 3.17z" />
      <rect x="14" y="14" width="9" height="9" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <line x1="16" y1="14" x2="16" y2="13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="19" y1="14" x2="19" y2="13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="21" y1="14" x2="21" y2="13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="14" y1="16" x2="13" y2="16" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="14" y1="19" x2="13" y2="19" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="14" y1="21" x2="13" y2="21" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

type Platform = {
  name: string;
  note: string;
  href: string;
  Icon: (props: { className?: string }) => React.JSX.Element;
  available: boolean;
};

const platforms: Platform[] = [
  {
    name: "macOS dmg",
    note: "apple silicon · 12+",
    href: MAC_DMG_URL,
    Icon: AppleIcon,
    available: true,
  },
  {
    name: "Windows",
    note: "10 / 11 · x64",
    href: "#soon",
    Icon: WindowsIcon,
    available: false,
  },
  {
    name: "intel mac",
    note: "x64 · 12+",
    href: "#soon",
    Icon: AppleIntelIcon,
    available: false,
  },
];

export default function DownloadPage() {
  return (
    <main
      className="relative flex h-screen w-screen flex-col overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse at 50% 0%, #ffd9e6 0%, #fff5fa 55%, #ffffff 100%)",
      }}
    >
      {/* top bar — back link */}
      <div className="absolute left-6 top-6 z-10 tablet:left-10 tablet:top-8">
        <Link
          href="/"
          className="font-sans text-[14px] font-medium text-muted-deep transition-colors hover:text-sakura-600"
        >
          ← back
        </Link>
      </div>

      {/* bottom bar — releases link */}
      <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 text-center font-sans text-[12px] text-muted-secondary">
        <a
          href={RELEASES}
          target="_blank"
          rel="noreferrer"
          className="text-sakura-600 underline-offset-4 hover:underline"
        >
          all releases on github →
        </a>
      </div>

      {/* center stack — fills remaining viewport */}
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center tablet:gap-8">
        <Image
          src="/kawaii/wordmark-pink-nano-t.png"
          alt="angel"
          width={800}
          height={400}
          className="h-auto w-[min(50vw,300px)] select-none"
          priority
        />

        <div className="flex flex-col items-center gap-2">
          <h1 className="m-0 max-w-[820px] font-bagel text-[32px] font-normal leading-[1.05] tracking-[-0.01em] text-ink-near tablet:text-[44px] desktop:text-[56px]">
            she lives on your machine.
          </h1>
          <p className="m-0 max-w-[520px] font-sans text-[14px] leading-[1.5] text-muted-deep tablet:text-[15px]">
            paste this in your terminal — installs in ~10 seconds.
          </p>
        </div>

        {/* PRIMARY action: one-line installer */}
        <InstallCommand />

        <div className="flex items-center gap-3 font-sans text-[12px] uppercase tracking-[0.18em] text-muted-tertiary">
          <span className="h-px w-10 bg-hairline" />
          <span>or grab the dmg</span>
          <span className="h-px w-10 bg-hairline" />
        </div>

        {/* SECONDARY: platform cards */}
        <ul className="grid w-full max-w-[820px] grid-cols-1 gap-3 tablet:grid-cols-3">
          {platforms.map((p) => {
            const Icon = p.Icon;
            const cardInner = (
              <>
                <Icon className="h-6 w-6 text-ink-near" />
                <div className="flex flex-col gap-0.5">
                  <span className="font-bagel text-[18px] leading-none text-ink-near">
                    {p.name}
                  </span>
                  <span className="font-sans text-[11px] text-muted-secondary">
                    {p.note}
                  </span>
                </div>
                <span className="mt-1 inline-flex items-baseline gap-2 font-sans text-[12px] font-semibold text-sakura-600 transition-transform duration-200 group-hover:translate-x-0.5">
                  <span>
                    {p.available ? "download ↓" : "see us at the table"}
                  </span>
                </span>
              </>
            );
            return (
              <li key={p.name}>
                {p.available ? (
                  <a
                    href={p.href}
                    className="group flex h-full flex-col items-start gap-1.5 rounded-2xl border border-hairline bg-cloud p-4 text-left transition-all duration-200 ease-out hover:-translate-y-1 hover:border-sakura-300 hover:shadow-[0_8px_0_rgba(199,78,122,0.18)]"
                  >
                    {cardInner}
                  </a>
                ) : (
                  <div
                    aria-disabled
                    className="group flex h-full cursor-not-allowed flex-col items-start gap-1.5 rounded-2xl border border-hairline bg-cloud/60 p-4 text-left opacity-60"
                  >
                    {cardInner}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}
