# moment.framer.photos — page structure

source: `data-framer-name` attributes traced across 14 captured html files in `/Users/stephenhung/Documents/GitHub/angel/reference/moment-mirror/site/`. screenshots in `./baseline/moment-raw/`.
viewport: 1440 × 900 desktop. framer breakpoints: ≤939 mobile, 940-1439 tablet, ≥1440 desktop.

## global chrome (consistent across all pages)

### top navigation (`Navigation` / `Navigation section`)
- container: full-width, sits at `y: 0`, height 90px on desktop.
- left: site wordmark + © glyph (`Site name + copyright symbol`) — text 'moment©' kerned tight.
- right: `menu` button (28px/600). this is the only nav cta — there are no inline page links in the top bar; navigation is a menu overlay.
- subtle hairline border (`#e9e9e9`) below.
- mobile variant exists but uses the same component tree — `Light - mobile`, `Small - white` swap at the 939 breakpoint.

### footer (`Footer container` / `Navigation + legal`)
appears on every route. structure top-down:
1. **wordmark band** — giant `moment` h1 at 160/500 (the same hero typography re-used as a closing flourish).
2. **email + location strip** (`Mail + location`) — large `kerrigan@hello.com` (45/500) + 'Oslo, Norway' meta.
3. **socials row** (`Socials`).
4. **legal row** (`Navigation + legal`) — © glyph, small print, 'Buy template' (14/600).
5. **dark band** — switches to `Dark` token surface for the bottom-most strip on some routes.

---

## / (home)

route: `index.html` — 120 unique framer names, the most complex page. content begins at `y: 426` (after a 426-tall hero block) and the page is roughly 9000px tall.

### 1. hero (`Header` + `Container`)
- `moment` wordmark h1 at 160/500, left-aligned at `x: 100, y: 426`. width 611, height 160.
- background image positioned behind (the page hero photo) — animated via the only **3-second slow-zoom-out** in the entire site (`scale 1.1 → 1`, `delay 0.4`, `ease [0,0,0,1]`).
- decorative meta: `Snow`, `Dot`, `Dots`, `Crosshair` markers placed around the hero image edges (corner registration marks — visual signature of this template).

### 2. about teaser (`Personal shoot` / `Title + subtitle`)
- intro h3 at 45/600: "This portfolio is a visual diary of places, people, and moments…". `x: 76, y: 1220`, width 576.
- right side: image with `Photoshoot location (first image)` + `Shooting location` overlays.
- meta: location label badges (`Location` / `Locations` markers).

### 3. campaigns + locations grid (`Campaigns` / `Locations` / `Service grid`)
- 4-card image grid with location labels. card titles at 32/500 ('Prague', etc.).
- internal framer names enumerate `Image 1` through `Image 5`, plus `First image` / `Second image` / `Third image` / `Fourth image` / `Image grid`.
- centered above the grid: section h2 'Moments I capture' (64/600) at `y: 2440`.

### 4. memories / testimonial section (`Memories` h2 + `Testimonials section`)
- h2 'Memories' at 64/600 (`y: 3797`).
- testimonial blockquote `Testimonial 1` — full-width quote at 45/600: "I usually hate getting my photo taken, but this felt totally different…" (`y: 5693`).
- testimonial card structure: `Testimonial author + image + shooting location` → image, name, location.
- variants: `Mobile - first testimonial`, `Variant 1`, `Variant 2` — multiple breakpoint layouts.

### 5. pexels showcase (`Pexels showcase`)
- 'Most viewed Pexels album' h2 at 64/600 (`y: 6731`).
- 4 pexels image cards (`Pexels 1` through `Pexels 4`), with `Pexels 3 - highlight` denoting one with emphasis treatment.

### 6. weddings + events teaser (`Weddings`, `Events`)
- additional teaser cards.

### 7. cta band + footer (`Bottom` / wordmark)
- `moment` h1 repeated at 160/500 (`y: 8808`).
- footer chrome.

framer signal of complexity: hero alone has 12 named decor children (`Snow`, `Dot`, `Crosshair`, `Background frame`, `Image dots`, `Image + author name + shooting location`, etc.) — this is the cinematic landing-page card.

---

## /about

61 unique framer names. simpler than home — bio + awards focus.

### 1. hero (`First section`)
- left: kicker h4 "I turn everyday moments into lasting memories through…" at 32/500 (`x: 776, y: 314`, width 524) — note the kicker sits to the **right** of an image, unusual asymmetric flip.
- right: `Image container` with author portrait.
- decor: `Dot`, `Dots`, `Crosshair`, registration marks reused.

### 2. awards block (`Awards` / `Awards + publications`)
- section h3 'Awards' at 45/600 (`y: 1721`).
- two `award` rows: `First award`, `Second award` with `Award names` list.
- parallel block: `Publications` / `Publication names` with `Center comment`.

### 3. stats / 'satisfied clients' / 'years of experience'
- `Satisfied clients`, `Years of experience` — number + label tiles.

### 4. memories CTA section
- 'Memories' h2 at 64/600 (`y: 2441`) — same font/scale as on home for cross-page rhythm.

### 5. gallery snippets (`Gallery snippets` / `Gallery preview - animation start`)
- horizontal scroller / preview band of recent gallery thumbs.

### 6. footer band
- standard `moment` h1 closing (160/500 at `y: 5218`).

---

## /gallery

47 unique framer names. simplest content tree — pure index of gallery sets.

### 1. header
- h1 'Memories' at 64/600 (`x: 100, y: 210`). this is the page title — moment uses 'memories' as the display name for galleries.
- subtitle below.

### 2. gallery list (`Image container`, `Title`)
- vertical or 2-col list of gallery cards: `Spring Bloom`, `Rooted Grace`, `Still Waters`, `Aroma`.
- each card: image + h4 title at 32/500 + meta line ('Shot in <country>' at 16/600).

### 3. footer band
- contact-cta strip with `kerrigan@hello.com` h3 (45/500) at `y: 5347`.

---

## /gallery/[slug] (e.g. spring-bloom)

detail page — 19 measured elements only, mostly image grid.
- header: gallery title at 64/600.
- main: image grid (likely masonry) with `By Henry Kerrigan` byline at 16/400 between images.
- footer: shared chrome.

---

## /contact

46 unique framer names. minimalist form-page.

### 1. hero (`Title`)
- h1 "Let's have a chat" at 64/600 (`x: 270, y: 210`). centered horizontally — note `x: 270`, so the title is offset right from the 100px gutter to land in a centered column.
- subtitle line under.

### 2. main content (`Main` / `Form + email + socials`)
- left: `Left text` block + email h4 'kerrigan@hello.com' (32/500 at `y: 918`).
- right: `Form` block with `Form inputs` (email field + message field). submit button labelled 'Send message' — UA-default sans-serif on the wrapper, label child renders inside.

### 3. footer band
- `kerrigan@hello.com` h3 (45/500 at `y: 1651`) re-emphasis + standard footer.

contact does not have a hero image — relies on typography + form layout.

---

## /journal

53 unique framer names. blog index.

### 1. hero (`Header + subtitle`)
- h1 'Studio journal' at 64/600 (`x: 100, y: 210`, width 1006 — full content width).

### 2. most-read feature (`Most read` / `Most read article` / `Most read article - pre animation`)
- featured article block — large image + h3 title at 45/600 (e.g. 'Photography for beginners' at `x: 644, y: 526`).
- `Author + date` meta row.
- `Article type` / `Tags` chips.

### 3. articles list (`Articles` / `Article - pre animation`)
- vertical list of article cards, each with image + title + tags + date.
- 'pre animation' suffixes indicate the framer-motion entry state.

### 4. footer band
- standard.

---

## /journal/[slug] (e.g. photography-for-beginners)

article detail page.
- title h1 at **64/500** (looser line-height variant — 89.6px vs 76.8px) at `y: 526`.
- body paragraphs at 20/500, line-height 30px.
- in-article subheads at 45/600.
- byline + date + tags.

---

## /privacy-policy + /terms-of-service

minimal text-only legal pages. inherit nav + footer chrome. h1 + body using `bodyDefaultRegular` (16/400). did not deeply trace — assume vertically-stacked rich-text.

---

## visual hierarchy & spacing summary

### container widths
- desktop (≥1440): 100px each side, content rect ~1240px (page is anchored at the 1440 design canvas).
- tablet (940-1439): 40px each side.
- mobile (≤939): 16px each side.

### vertical rhythm
- section top padding: 160px (desktop), 120px (tablet+mobile).
- section bottom padding: 60px.
- between sections: ~120-140px effective gap.

### grid patterns
- 2-col image grids on desktop, 1-col on mobile/tablet under 940.
- 4-up campaign card row (`Image 1` through `Image 4`) on home.
- masonry-style on gallery detail.

### consistent design motifs
- **registration marks** — `Crosshair`, `Dot`, `Snow`, `Dots` decorative elements appear on home + about hero; deliberate visual signature.
- **wordmark band** — every page closes with the giant 160px `moment` h1 above the footer chrome. it's both a brand stamp and a vertical anchor.
- **`Get in touch` CTA** — appears as a named element on every page (home, about, gallery, contact, journal). likely a sticky / repeating cta block.
- **dark + light variants** — most components have `Light`, `Dark`, `Small - white`, `Small - black` siblings. the site is light-only as rendered, but framer design carries dark variants.

## animated elements

every section block carries a framer-motion entrance — see `motion-spec.md`. high-traffic patterns:
- `Gallery preview - animation start` (about, gallery) — explicit pre-animation state.
- `Article - pre animation` and `Most read article - pre animation` (journal) — same.
- the hero image on home is the only element with a 3-second scale-from-1.1 reveal.

## notes on unusual structure

- **mobile-first?** no — framer authors at the desktop 1440 canvas and breakpoints down. mirror this in tailwind via `min-w-[1440px]:` or a custom canvas class, otherwise use `@container` queries.
- **only 2 real breakpoints** — 940 and 1440. unlike yuya's 3-tier system, moment is binary (mobile vs tablet vs desktop ≥1440).
- **no traditional sidebar nav, no inline page links in the top bar** — entire nav lives behind a 'menu' button. the rebuild needs an overlay/menu component as a real piece of work.
- **'memories' is the gallery vocabulary** — the gallery index calls itself `Memories`. preserve that term in the rebuild's content; don't relabel.
- **decor tile motifs** (`Crosshair`, `Snow`, `Dots`) are pixel art elements — confirm asset extraction in `site/images/` before clean port.
