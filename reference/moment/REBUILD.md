# Moment → Angel rebuild prompt

> reverse-engineered from https://moment.framer.photos
> use this as the prompt for v0/cursor/codex to rebuild the angel landing page in next.js + tailwind, keeping moment's tonal soul but stripping its photography content.

## tokens (extracted from inline framer css)

### palette
```css
/* moment defaults (kept) */
--ink:        #060606;  /* near-black, primary text + dark blocks */
--paper:      #FBFBFB;  /* off-white primary bg */
--cloud:      #FFFFFF;  /* pure white block bg */
--ash:        #141414;  /* dark block alt */
--coal:       #282828;  /* dark accent surface */
--stone:      #525252;  /* mid grey */
--mute:       #666666;  /* muted text */

/* moment → angel swaps */
--paper-warm: #FAF6EF;  /* warm cream — replaces #FBFBFB everywhere */
--ember:      #E07856;  /* terracotta — replaces moment's #0099FF blue */
--gold:       #FFD66E;  /* spotlight, used sparingly for vector orb glow */
```

### typography
```
display:    Manrope (weights 400, 500, 600, 700)  — moment uses this; KEEP for nav + h2
hero:       Instrument Serif Italic              — SWAP (moment uses Manrope; we want serif soul)
body:       Inter                                 — keep
mono:       Fragment Mono                         — KEEP for technical metadata (the "specs" sprinkles)
chunky:     Bagel Fat One                         — ADD for angel's quoted dialogue + cta button
```

### radii + spacing
- radii: `8px` (cards), `12px` (containers), `999px` (pills, buttons)
- gap rhythm: `4 / 8 / 10 / 12 / 16 / 32 / 40 / 80` (px)
- container max-width: `1920px`, breakpoints at `940px` and `1440px`

### motion
- transitions: subtle cubic-bezier — match moment's easing
- gallery hover: `transform:scale(1.1)` — keep for archetype card hover
- soft springs > linear (use framer-motion `type:'spring', stiffness:300, damping:30`)

## structural map: moment → angel

moment is built on a **photographer-portfolio editorial structure**. preserve the rhythm, swap the content.

| moment section | angel rewrite |
|---|---|
| **header:** "moment" wordmark + "Buy template" cta + menu | **"angel"** wordmark (instrument serif italic) + "begin" cta (chunky bagel-fat-one pill) + minimal menu (about / discover) |
| **hero:** big photo, photographer credit "By Henry Kerrigan", camera specs sprinkled (`6720 × 4480`, `Canon EOS`, `36 x 24 mm`) | **single warm scene image** (painterly, warm window/room, ghibli-coded) + **angel name** in instrument serif italic + **technical metadata sprinkled** in fragment mono: `768d persona vector / sonnet 4.6 / nia memory / convex realtime` (the same atmosphere-by-tech-detail trick) |
| **section 01 — About:** "This portfolio is a visual diary of places, people, and moments I've collected through the lens." + quote | **section 01 — Origin:** "she's a presence, not an app. discovered through choice, not designed through prompts." + **pull quote in bagel-fat-one:** "she's not designed. she's discovered." + cta "begin discovery" |
| **section 02 — Services:** Personal Shoots / Campaigns / Weddings / Events with descriptions | **section 02 — What she is:** Presence / Memory / Agency / Continuity (4 cards, same grid layout) — each card a one-liner from VISION.md doctrine |
| **section 03 — Gallery:** photo grid w/ titles + cities ("Spring Bloom / London") | **section 03 — Discover:** the swipe interface lives here, full-bleed. archetype cards become the "gallery" — but instead of viewing them, you swipe. labels: archetype name + aesthetic word (e.g., "Cottagecore / Warm" replaces "Spring Bloom / London") |
| **section 04 — Testimonials:** word-by-word animated quote ("I usually hate getting my photo taken, but this felt totally different") | **section 04 — Early voices:** same animated treatment but with: "i usually don't trust ai. she felt different." plus 1-2 more (write 4 fake-but-believable quotes, italic instrument serif) |
| **footer cta:** "Buy template" | **footer cta:** "meet your angel" — full-width, chunky bagel-fat-one button, terracotta bg, cream ink, soft shadow |

## the rebuild prompt (paste into v0 / cursor / codex)

````
build a next.js 15 + tailwind landing page for "angel", a personal AI companion.

inspired by https://moment.framer.photos — preserve its editorial structure and tonal warmth, but strip all photography content and rewrite for angel.

DESIGN TOKENS:
- bg: #FAF6EF (warm cream, primary)
- ink: #060606 (near-black, primary text)
- accent: #E07856 (terracotta, replaces blue)
- dark-block: #141414 (alt section bg)
- mute: #666666 (secondary text)
- gold: #FFD66E (sparingly for highlights/orb glow)

TYPOGRAPHY (google fonts):
- Instrument Serif Italic — h1, hero name "angel", pull quotes
- Manrope (400/500/600/700) — h2, nav, ui chrome
- Inter — body
- Fragment Mono — technical metadata sprinkles
- Bagel Fat One — angel's spoken/quoted dialogue + cta button text only

LAYOUT:
- max-width 1920px, breakpoints 940px and 1440px
- generous gap rhythm (32px/40px/80px between sections)
- radii: 8px cards / 12px containers / 999px pills
- editorial section headers numbered (01 / 02 / 03 / 04) like moment

SECTIONS (in order):
1. header — "angel" wordmark (instrument serif italic), nav (about / discover), pill cta "begin"
2. hero — full-bleed warm scene image (placeholder: a warm cream gradient w/ a single soft glowing orb at center). overlaid: "angel" massive instrument serif italic. metadata sprinkled in fragment mono around the edges: "768d persona vector / sonnet 4.6 / nia memory / convex realtime"
3. section 01 "/ origin" — paragraph: "she's a presence, not an app. discovered through choice, not designed through prompts." + bagel-fat-one pull quote: "she's not designed. she's discovered." + button "begin discovery"
4. section 02 "/ what she is" — 4-card grid: Presence / Memory / Agency / Continuity. each card = title + one-line description + small icon
5. section 03 "/ discover" — full-bleed dark block (#141414, white text). says "swipe to find her." big chunky cta to the swipe page (which lives at /onboarding)
6. section 04 "/ early voices" — animated word-by-word quote like moment: "i usually don't trust ai. she felt different." + 2-3 italic pull quotes underneath
7. footer cta — full-width chunky bagel-fat-one button "meet your angel" (terracotta bg, cream text, soft shadow)

MOTION:
- soft springs (framer-motion: stiffness 300, damping 30)
- archetype card hover: scale(1.1)
- subtle parallax on hero scroll
- words animate in word-by-word for the testimonial section

CONSTRAINTS:
- NO ai-saas tropes (no gradient mesh, no "powered by AI", no feature bento grids, no logo strip)
- NO testimonials carousel — single big animated pull quote
- NO pricing, NO contact form
- it's a doorway, not a marketing page

deploy target: vercel.
````

## assets needed

before build:
- [ ] generate hero image — midjourney prompt: `a warm cozy bedroom window seen from outside at golden hour, soft light spilling through, watercolor painting, ghibli style, dust particles in light, --ar 16:9 --style raw`
- [ ] 4 archetype reference images for section 03 (or use placeholder gradients)
- [ ] no logo needed — wordmark is the brand

## what i didn't extract

- moment's exact framer animations (fps + curves) — would need headed browser
- final compiled css class names (framer obfuscates) — but tokens above are sufficient to rebuild from scratch in tailwind
- the actual photographs — replaced w/ painterly hero + archetype cards

## quick start

1. read this REBUILD.md
2. paste the prompt block (above) into v0 (https://v0.dev) — you have $30 credits via NOZOMIO-V0
3. download the result, drop into `web/src/app/page.tsx`
4. install fonts (next/font/google for the gfonts, fontshare cdn for fragment mono if needed)
5. tailwind config: extend `colors` w/ the palette above
6. swap placeholder hero image for the midjourney generation
7. `vercel --prod` → bank submission url

estimated total: 30-45 min from zero to deployed cream landing.
