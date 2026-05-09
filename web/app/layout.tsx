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
import { PageTransition } from "@/components/PageTransition";

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

const SITE_URL = "https://angel-swipe.vercel.app";
const TITLE = "angel — your kawaii AI agent, discovered not designed";
const DESC =
  "angel is a kawaii desktop AI companion. swipe through 4 archetypes, converge on a 768d persona vector, and meet a chibi-style agent who remembers you across sessions, ships your code, and lives on your machine. built on sonnet 4.6 + nia memory + convex realtime.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "%s · angel",
  },
  description: DESC,
  keywords: [
    "angel",
    "kawaii ai",
    "ai agent",
    "personal ai",
    "ai companion",
    "desktop agent",
    "anthropic sonnet",
    "claude agent",
    "always-on agent",
    "agentic orchestration",
    "vroid avatar agent",
    "discovered not designed",
    "天使",
    "kawaii sticker design",
    "convex realtime",
    "nia memory",
  ],
  applicationName: "angel",
  authors: [{ name: "Stephen Hung" }, { name: "Matthew Kim" }],
  creator: "Stephen Hung & Matthew Kim",
  publisher: "angel",
  category: "ai-companions",
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    siteName: "angel",
    title: TITLE,
    description: DESC,
    url: SITE_URL,
    locale: "en_US",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "angel — kawaii AI desktop coworker. she sits at the desk with you.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESC,
    creator: "@stephenhungg",
    images: ["/og.png"],
  },
  icons: {
    icon: [
      { url: "/kawaii/wordmark-pink-nano.png", type: "image/png" },
    ],
    apple: "/kawaii/wordmark-pink-nano.png",
  },
  manifest: "/manifest.webmanifest",
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
  other: {
    "theme-color": "#ff85a8",
    "color-scheme": "light",
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
      <body className="bg-paper text-ink-near antialiased">
        <PageTransition>{children}</PageTransition>
      </body>
    </html>
  );
}
