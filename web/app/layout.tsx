import type { Metadata } from "next";
import {
  Manrope,
  Instrument_Serif,
  Fragment_Mono,
  Bagel_Fat_One,
  Mochiy_Pop_One,
  Klee_One,
  Noto_Serif_JP,
} from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-manrope",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  style: ["italic", "normal"],
  display: "swap",
  variable: "--font-instrument-serif",
});

const fragmentMono = Fragment_Mono({
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
  variable: "--font-fragment-mono",
});

// kawaii sticker-style display fonts — match the SAWARATSUKI vibe
const bagelFatOne = Bagel_Fat_One({
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
  variable: "--font-bagel",
});

const mochiyPop = Mochiy_Pop_One({
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
  variable: "--font-mochiy",
});

// kawaii japanese rounded-brush for kanji body text
const kleeOne = Klee_One({
  subsets: ["latin"],
  weight: ["400", "600"],
  display: "swap",
  variable: "--font-klee",
});

// Noto Serif Japanese — for the bait intro 天使 reveal moment
const notoSerifJP = Noto_Serif_JP({
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
  display: "block", // block = wait for font, no fallback flash on the dramatic reveal
  variable: "--font-noto-serif-jp",
});

export const metadata: Metadata = {
  title: "angel — discovered, not designed",
  description:
    "a personal ai agent you don't prompt — you discover. swipe through generated archetypes, converge on a persona vector, and meet a presence who lives on your machine, remembers you across sessions, and ships your code.",
  metadataBase: new URL("https://angel.fyi"),
  openGraph: {
    title: "angel",
    description: "she's not designed. she's discovered.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${instrumentSerif.variable} ${fragmentMono.variable} ${bagelFatOne.variable} ${mochiyPop.variable} ${kleeOne.variable} ${notoSerifJP.variable}`}
    >
      <body className="bg-paper text-ink-near antialiased">{children}</body>
    </html>
  );
}
