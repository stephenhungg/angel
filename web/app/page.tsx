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

export default function HomePage() {
  return (
    <>
      <SmoothScroll />
      <Cursor />
      <BaitIntro>
        <main className="min-h-screen bg-paper">
          <Nav />
          <Hero />
          <Origin />
          <WhatSheIs />
          <Archetypes />
          <Showcase />
          {/* credit-roll marquee — silent moving strip of the stack she runs on */}
          <section className="relative border-y border-hairline bg-paper py-8 tablet:py-10">
            <LogoMarquee logos={stack} duration={42} />
          </section>
          <Footer />
        </main>
      </BaitIntro>
    </>
  );
}
