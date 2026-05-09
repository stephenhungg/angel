# moment typography — pulled from live DOM

source: `https://moment.framer.photos/{,about,gallery,contact,journal,gallery/spring-bloom,journal/photography-for-beginners}` via playwright on 1440×900 against the local mirror.
method: walk every text node in the captured selectors, pull `getComputedStyle`, dedupe by (family, size, weight, line-height, letter-spacing). all visible nodes are **manrope**, no italics, no `text-transform: uppercase`.

## type scale (descending)

| size  | line-height | weight | letter-spacing | used for                                                                                         |
|-------|-------------|--------|----------------|--------------------------------------------------------------------------------------------------|
| 160px | 160px (1.0) | 500    | -3.2px (~-.02em) | wordmark hero `moment` on home + above-footer band (8 instances)                                |
| 64px  | 76.8px (1.2)| 600    | -1.28px        | section h1/h2 — 'Memories', 'Moments I capture', 'Studio journal', 'Let's have a chat'           |
| 64px  | 89.6px (1.4)| 500    | -1.28px        | journal article h1 (e.g. 'Photography for beginners') — looser variant                           |
| 45px  | 63px (1.4)  | 600    | normal         | h3 — 'Awards', testimonial blockquote, journal article cards, home intro paragraph               |
| 45px  | 45px (1.0)  | 500    | normal         | contact email link h3 'kerrigan@hello.com' — display-tight variant                               |
| 32px  | 48px (1.5)  | 500    | normal         | h4 — gallery card titles ('Spring Bloom', 'Prague'), about kicker, contact email h4              |
| 28px  | 26px (0.93) | 600    | normal         | nav 'menu' button (top-right) — tight bold label                                                 |
| 20px  | 30px (1.5)  | 500    | normal         | journal article body                                                                              |
| 16px  | 24px (1.5)  | 600    | normal         | meta-bold ('Shot in', author lead) — most-frequent style, 59 instances                            |
| 16px  | 24px (1.5)  | 500    | normal         | meta-medium values ('Oslo, Norway')                                                              |
| 16px  | 16px (1.0)  | 400    | normal         | tight bylines ('By Henry Kerrigan')                                                              |
| 14px  | 24px (1.71) | 600    | normal         | footer fine link 'Buy template'                                                                  |
| 12px  | 14px (1.17) | 600    | -0.64px        | footer © glyph                                                                                   |

## per-page font usage

### home (`/`)
- hero h1 `moment`: 160/500 — appears twice (top-of-page hero + above-footer band).
- 'This portfolio is a visual diary of places, people, and moments…': 45/600 (h3, intro paragraph).
- 'Prague' (and other location card titles): 32/500 (h4).
- 'Moments I capture': 64/600 (h2 section heading).
- testimonial '"I usually hate getting my photo taken…"': 45/600 (h3, quote block).
- 'Most viewed Pexels album': 64/600 (h2).
- 'Buy template' link: 14/600.

### about (`/about`)
- kicker 'I turn everyday moments into lasting memories through…': 32/500 (h4) — large lead paragraph.
- 'Awards': 45/600 (h3 section title).
- 'Memories': 64/600 (h2).
- footer wordmark `moment`: 160/500 again.

### gallery (`/gallery`)
- 'Memories' (page title): 64/600 (h1).
- gallery card titles ('Spring Bloom', etc.): 32/500 (h4).
- 'kerrigan@hello.com' (contact-cta in footer band): 45/500 (h3).
- card meta ('Shot in <country>', author bylines): 16/600 + 16/500.

### gallery detail (`/gallery/spring-bloom`)
- title at top: 64/600.
- image meta + 'By <author>': 16/400.

### contact (`/contact`)
- 'Let's have a chat': 64/600 (h1).
- contact email h4 'kerrigan@hello.com': 32/500 — duplicated as h3 in footer band at 45/500.
- 'Send message' button label: 12/400 (UA default sans-serif on the inline button — framer renders the visible label text in a child node, the button itself reports the wrapper style).

### journal (`/journal`)
- 'Studio journal' header: 64/600.
- article card titles: 45/600.
- meta byline + date: 16/600 / 16/400.

### journal detail (`/journal/photography-for-beginners`)
- article h1 'Photography for beginners': 64/500 (looser line-height than section h1).
- body paragraphs: 20/500, 30px line-height.

## notes

- **all manrope, no font-family swaps.** zero usage of fragment mono on these routes despite three `@font-face` rules loading it (template default for `code` blocks). zero usage of inter despite framer loading it as a fallback for blockquote / rich-text.
- **no italic** anywhere measured.
- **no `text-transform: uppercase`** — every uppercase string is uppercase in the source.
- **letter-spacing** is tight on display sizes (~-0.02em / -1.28px on 64px, -3.2px on 160px) and `normal` on everything 32px and below — except the 12px copyright glyph which goes -0.64px.
- **weight bias is medium-heavy.** the template never goes below 400 or above 600. all big copy is 500-600. there is no italic, no light, no black.
- **line-height shape:** display sizes (160/64) sit between 1.0 and 1.4 for impact; body and h4 are 1.5; the 28/600 nav label is sub-1 (0.93) for tight set in a small chip.

## mapping to angel rebuild (recommended tailwind / css custom props)

| moment scale          | suggested class / css                                              |
|-----------------------|---------------------------------------------------------------------|
| 160/500 hero          | `text-[160px] font-medium leading-none tracking-[-0.02em]`         |
| 64/600 section        | `text-[64px] font-semibold leading-[1.2] tracking-[-0.02em]`        |
| 64/500 article-h1     | `text-[64px] font-medium  leading-[1.4] tracking-[-0.02em]`         |
| 45/600 h3             | `text-[45px] font-semibold leading-[1.4]`                           |
| 45/500 email-link     | `text-[45px] font-medium leading-none`                              |
| 32/500 h4 / kicker    | `text-[32px] font-medium leading-[1.5]`                             |
| 28/600 nav menu       | `text-[28px] font-semibold leading-[0.93]`                          |
| 20/500 article body   | `text-[20px] font-medium leading-[1.5]`                             |
| 16/600 meta-bold      | `text-base font-semibold leading-[1.5]`                             |
| 16/500 meta-medium    | `text-base font-medium leading-[1.5]`                               |
| 16/400 byline         | `text-base font-normal leading-none`                                |
| 14/600 footer link    | `text-sm font-semibold leading-[1.71]`                              |
| 12/600 footer micro   | `text-xs font-semibold leading-[1.17] tracking-[-0.053em]`          |

mobile/tablet variants were not measured (framer breakpoints are 940 and 1440). recommend a re-probe at 390 + 1024 viewports during phase-3 if pixel-perfect fidelity matters.
