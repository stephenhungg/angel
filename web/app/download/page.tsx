import Link from "next/link";
import Image from "next/image";

export const metadata = {
  title: "download angel",
  description: "she lives on your machine. download her.",
};

const RELEASES = "https://github.com/stephenhungg/angel/releases";
const MAC_DMG_URL =
  "https://github.com/stephenhungg/angel/releases/download/v0.0.1-alpha/Angel-0.0.1-arm64.dmg";

const platforms = [
  {
    name: "macOS",
    note: "apple silicon · 12+",
    href: MAC_DMG_URL,
    icon: "🍎",
    available: true,
  },
  {
    name: "Windows",
    note: "10 / 11 · x64",
    href: "#soon",
    icon: "▣",
    available: false,
  },
  {
    name: "intel mac",
    note: "x64 · 12+",
    href: "#soon",
    icon: "💻",
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
      <div className="absolute bottom-5 left-1/2 z-10 -translate-x-1/2 text-center font-sans text-[12px] text-muted-secondary">
        <a
          href={RELEASES}
          target="_blank"
          rel="noreferrer"
          className="text-sakura-600 underline-offset-4 hover:underline"
        >
          github.com/stephenhungg/angel/releases
        </a>
        <span className="ml-3 text-muted-tertiary">
          first launch on mac: <code className="font-mono">xattr -cr /Applications/Angel.app</code>
        </span>
      </div>

      {/* center stack — fills remaining viewport */}
      <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 text-center tablet:gap-10">
        <Image
          src="/kawaii/wordmark-pink-nano-t.png"
          alt="angel"
          width={800}
          height={400}
          className="h-auto w-[min(60vw,360px)] select-none"
          priority
        />

        <div className="flex flex-col items-center gap-3">
          <h1 className="m-0 max-w-[820px] font-bagel text-[36px] font-normal leading-[1.05] tracking-[-0.01em] text-ink-near tablet:text-[52px] desktop:text-[64px]">
            she lives on your machine.
          </h1>
          <p className="m-0 max-w-[520px] font-sans text-[15px] leading-[1.5] text-muted-deep tablet:text-[16px]">
            download, drag into <span className="font-mono">Applications</span>,
            then come back and let her in.
          </p>
        </div>

        <ul className="grid w-full max-w-[820px] grid-cols-1 gap-4 tablet:grid-cols-3">
          {platforms.map((p) => {
            const cardInner = (
              <>
                <span className="text-[24px] leading-none">{p.icon}</span>
                <div className="flex flex-col gap-0.5">
                  <span className="font-bagel text-[20px] leading-none text-ink-near">
                    {p.name}
                  </span>
                  <span className="font-sans text-[12px] text-muted-secondary">
                    {p.note}
                  </span>
                </div>
                <span className="mt-2 inline-flex items-baseline gap-2 font-sans text-[13px] font-semibold text-sakura-600 transition-transform duration-200 group-hover:translate-x-0.5">
                  <span>{p.available ? "download ↓" : "coming soon"}</span>
                </span>
              </>
            );
            return (
              <li key={p.name}>
                {p.available ? (
                  <a
                    href={p.href}
                    className="group flex h-full flex-col items-start gap-2 rounded-2xl border border-hairline bg-cloud p-5 text-left transition-all duration-200 ease-out hover:-translate-y-1 hover:border-sakura-300 hover:shadow-[0_8px_0_rgba(199,78,122,0.18)]"
                  >
                    {cardInner}
                  </a>
                ) : (
                  <div
                    aria-disabled
                    className="group flex h-full cursor-not-allowed flex-col items-start gap-2 rounded-2xl border border-hairline bg-cloud/60 p-5 text-left opacity-60"
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
