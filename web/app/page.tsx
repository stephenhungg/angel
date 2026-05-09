import { BaitIntro } from "@/components/BaitIntro";
import { SmoothScroll } from "@/components/SmoothScroll";
import { Nav } from "@/components/Nav";
import { Hero } from "@/components/Hero";
import { Origin } from "@/components/Origin";
import { WhatSheIs } from "@/components/WhatSheIs";
import { Archetypes } from "@/components/Archetypes";
import { Showcase } from "@/components/Showcase";
import { Footer } from "@/components/Footer";

// JSON-LD structured data — helps google parse "what is angel".
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
        "a kawaii desktop AI companion you don't prompt — you discover. swipe-converge on a 768d persona vector, then she sits at the desk with you for 8 hours and you don't feel alone.",
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
        "an embodied desktop AI coworker. you discover her via swipe, then she lives on your machine — walks to the desk, sits, ships code, remembers you across sessions, replies via SMS when you close the laptop.",
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
            text: "angel is a kawaii desktop AI coworker. you don't pick her or prompt her — you discover her by swiping through 12 cards across aesthetic, disposition, and style. her persona vector converges in a 768-dimensional space, so your specific her is one of millions of possible combinations. she lives on your machine, walks to the desk, ships your code, remembers you across sessions, and replies via SMS when the laptop is closed.",
          },
        },
        {
          "@type": "Question",
          name: "is angel just another AI agent?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "no. devin and openclaw and hermes ship code; angel sits at the desk with you so you don't feel alone for 8 hours. agents are converging on capability — angel diverges on engagement.",
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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <SmoothScroll />
      <BaitIntro>
        <main className="min-h-screen bg-paper">
          <Nav />
          <h1 className="sr-only">
            angel — a kawaii desktop AI coworker you discover, not prompt. she
            sits at the desk with you for 8 hours and you don&apos;t feel alone.
            highly customizable via swipe-converged persona vector.
          </h1>
          <Hero />
          <Origin />
          <WhatSheIs />
          <Archetypes />
          <Showcase />
          <Footer />
        </main>
      </BaitIntro>
    </>
  );
}
