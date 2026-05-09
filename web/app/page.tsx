import { BaitIntro } from "@/components/BaitIntro";
import { SmoothScroll } from "@/components/SmoothScroll";
import { Cursor } from "@/components/Cursor";
import { Nav } from "@/components/Nav";
import { Hero } from "@/components/Hero";
import { Origin } from "@/components/Origin";
import { WhatSheIs } from "@/components/WhatSheIs";
import { Archetypes } from "@/components/Archetypes";
import { Showcase } from "@/components/Showcase";
import { LogoMarquee } from "@/components/LogoMarquee";
import { Footer } from "@/components/Footer";

const stack: { name: string; image?: string }[] = [
  { name: "next.js" },
  { name: "convex" },
  { name: "sonnet 4.6" },
  { name: "nia memory" },
  { name: "tensorlake" },
  { name: "codex" },
  { name: "framer-motion" },
  { name: "gsap" },
  { name: "tailwind" },
  { name: "lenis" },
  { name: "noto serif jp" },
  { name: "bagel fat one" },
  { name: "天使" },
];

// JSON-LD structured data — helps google parse "what is angel". covers
// SoftwareApplication (the desktop electron app) + WebSite + FAQ.
const SITE_URL = "https://angel-swipe.vercel.app";
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: "angel",
      description:
        "a kawaii desktop AI companion you discover, not prompt. ships your code, remembers you across sessions.",
      inLanguage: "en-US",
      publisher: { "@id": `${SITE_URL}/#org` },
    },
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#org`,
      name: "angel",
      url: SITE_URL,
      logo: `${SITE_URL}/kawaii/wordmark-pink-nano.png`,
      sameAs: ["https://github.com/stephenhungg/angel"],
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE_URL}/#app`,
      name: "angel",
      applicationCategory: "ProductivityApplication",
      operatingSystem: "macOS, Windows, Linux",
      url: `${SITE_URL}/download`,
      description:
        "an embodied desktop AI agent. discover her via swipe, then she lives on your machine — remembers, ships code, replies via SMS when you close the laptop.",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      image: `${SITE_URL}/kawaii/wordmark-pink-nano.png`,
    },
    {
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "what is angel?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "angel is a kawaii desktop AI companion. you don't prompt her — you discover her by swiping through 4 generated archetypes (soft, warm, deep, quiet). she lives on your machine, remembers you across sessions, ships your code, and replies via SMS when the laptop is closed.",
          },
        },
        {
          "@type": "Question",
          name: "what is the angel stack?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "claude sonnet 4.6 orchestrator + codex executor + nia memory + convex realtime + tensorlake. desktop is electron + react three fiber + three-vrm. web is next.js + tailwind + gsap + framer-motion + lenis.",
          },
        },
        {
          "@type": "Question",
          name: "is angel free?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "yes. download for mac, windows, or linux from the github releases.",
          },
        },
      ],
    },
  ],
};

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        // safe — fully constant + we control the content
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <SmoothScroll />
      <Cursor />
      <BaitIntro>
        <main className="min-h-screen bg-paper">
          <Nav />
          <h1 className="sr-only">
            angel — your kawaii AI agent. discovered, not designed. she lives
            on your machine, remembers you across sessions, and ships your code.
          </h1>
          <Hero />
          <Origin />
          <WhatSheIs />
          <Archetypes />
          <Showcase />
          <section className="relative border-y border-hairline bg-paper py-8 tablet:py-10">
            <LogoMarquee logos={stack} duration={42} />
          </section>
          <Footer />
        </main>
      </BaitIntro>
    </>
  );
}
