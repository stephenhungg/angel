import { BaitIntro } from "@/components/BaitIntro";
import { SmoothScroll } from "@/components/SmoothScroll";
import { Nav } from "@/components/Nav";
import { Hero } from "@/components/Hero";
import { Origin } from "@/components/Origin";
import { WhatSheIs } from "@/components/WhatSheIs";
import { Archetypes } from "@/components/Archetypes";
import { Voices } from "@/components/Voices";
import { Showcase } from "@/components/Showcase";
import { Footer } from "@/components/Footer";

// landing assembly — section order is a 1:1 mirror of moment.framer.photos's
// home flow (verified against /reference/moment/page-structure.md):
//
//   nav → hero → 01 origin (about teaser) → 02 what-she-is (dark services grid
//   + primary cta) → archetypes (gallery list, 2x2) → 03 voices (testimonial)
//   → 04 showcase (pexels) → footer
//
// the dark-band cta that used to live in a separate Discover section is now
// folded into 02/what-she-is, which matches moment's pattern of putting the
// primary cta inside the dark services grid.
export default function HomePage() {
  return (
    <>
      <SmoothScroll />
      <BaitIntro>
        <main className="min-h-screen bg-paper">
          <Nav />
          <Hero />
          <Origin />
          <WhatSheIs />
          <Archetypes />
          <Voices />
          <Showcase />
          <Footer />
        </main>
      </BaitIntro>
    </>
  );
}
