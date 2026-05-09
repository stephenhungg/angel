import Link from "next/link";
import Image from "next/image";

export const metadata = {
  title: "download angel",
  description: "she lives on your machine. download her.",
};

// canonical github releases — swap to direct .dmg / .exe URLs once we ship
const RELEASES = "https://github.com/stephenhungg/angel/releases/latest";

const platforms = [
  {
    name: "macOS",
    note: "apple silicon · 12+",
    href: `${RELEASES}/download/angel-mac.dmg`,
    icon: "🍎",
  },
  {
    name: "Windows",
    note: "10 / 11 · x64",
    href: `${RELEASES}/download/angel-win.exe`,
    icon: "▣",
  },
  {
    name: "Linux",
    note: ".AppImage · x64",
    href: `${RELEASES}/download/angel-linux.AppImage`,
    icon: "🐧",
  },
];

export default function DownloadPage() {
  return (
    <main
      className="relative min-h-screen overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse at 50% 0%, #ffd9e6 0%, #fff5fa 55%, #ffffff 100%)",
      }}
    >
      <div className="gutter relative pt-[160px] pb-[120px]">
        <Link
          href="/"
          className="font-sans text-[14px] font-medium text-muted-deep transition-colors hover:text-sakura-600"
          data-cursor-grow
        >
          ← back
        </Link>

        <div className="mt-12 flex flex-col items-center text-center">
          <Image
            src="/kawaii/wordmark-pink-nano-t.png"
            alt="angel"
            width={800}
            height={400}
            className="h-auto w-[min(80vw,520px)] select-none"
            priority
          />

          <h1 className="mt-12 max-w-[820px] font-bagel text-[44px] font-normal leading-[1.05] tracking-[-0.01em] text-ink-near tablet:text-[64px] desktop:text-[80px]">
            she lives on your machine.
          </h1>
          <p className="mt-6 max-w-[560px] font-sans text-[18px] leading-[1.5] text-muted-deep">
            angel is a desktop companion. download for your platform — first launch
            walks you through the swipe, then she moves in.
          </p>

          <ul className="mt-14 grid w-full max-w-[920px] grid-cols-1 gap-5 tablet:grid-cols-3">
            {platforms.map((p) => (
              <li key={p.name}>
                <a
                  href={p.href}
                  className="group flex h-full flex-col items-start gap-3 rounded-2xl border border-hairline bg-cloud p-7 text-left transition-all duration-200 ease-out hover:-translate-y-1 hover:border-sakura-300 hover:shadow-[0_8px_0_rgba(199,78,122,0.18)]"
                  data-cursor-grow
                >
                  <span className="text-[28px] leading-none">{p.icon}</span>
                  <div className="flex flex-col gap-1">
                    <span className="font-bagel text-[24px] leading-none text-ink-near">
                      {p.name}
                    </span>
                    <span className="font-mono text-[12px] text-muted-secondary">
                      {p.note}
                    </span>
                  </div>
                  <span className="mt-auto inline-flex items-baseline gap-2 font-sans text-[14px] font-semibold text-sakura-600 transition-transform duration-200 group-hover:translate-x-0.5">
                    <span>download</span>
                    <span aria-hidden>↓</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>

          <div className="mt-10 flex flex-col items-center gap-2 font-mono text-[12px] text-muted-secondary">
            <span>or grab the latest release directly →</span>
            <a
              href={RELEASES}
              target="_blank"
              rel="noreferrer"
              className="text-sakura-600 underline-offset-4 hover:underline"
            >
              github.com/stephenhungg/angel/releases
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
