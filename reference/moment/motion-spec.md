# motion spec — moment.framer.photos mirror

source: `/Users/stephenhung/Documents/GitHub/angel/reference/moment-mirror/site/`
purpose: forensic catalog of every animation/transition for clean-port re-implementation (framer-motion or gsap).

## tl;dr

moment runs almost all entrance animations as **framer-motion springs** (`type: spring`, `bounce: 0.2`) — not as cubic-bezier tweens. unlike yuya, there are **no y-translation initials** (initials are `y:0`) — the appear effect is opacity + a single scale variant. the only authored cubic-bezier eases are `[0,0,0,1]` (used twice) and `[0.12,0.23,0.5,1]` (used once). there is no per-page motion table because **every page reuses the same 3-4 transition primitives**.

## authored transitions (deduped, all pages)

| count | type   | bounce | delay | duration | ease            | role                                              |
|-------|--------|--------|-------|----------|-----------------|---------------------------------------------------|
| 28    | spring | 0.2    | 0     | 1.2s     | —               | default appear: opacity 0.001 → 1, no transform   |
| 4     | spring | 0.2    | 1.2   | 1.6s     | —               | post-hero secondary content (fades in after hero) |
| 3     | spring | 0.2    | 1.2   | 1.2s     | —               | tertiary stagger sibling                          |
| 1     | tween  | —      | 0.4   | 3.0s     | [0,0,0,1]       | hero image scale-down (1.1 → 1) — slow reveal     |
| 1     | tween  | —      | 1.2   | 1.8s     | [0.12,0.23,0.5,1]| late-deck reveal                                  |
| 1     | spring | 0.2    | 0.6   | 1.2s     | —               | mid-stagger element                               |
| 1     | tween  | —      | 0.6   | 1.6s     | [0,0,0,1]       | mid-stagger image-style reveal                    |

## initial states

every authored variant starts from:

```json
{ "opacity": 0.001, "rotate": 0, "rotateX": 0, "rotateY": 0, "scale": 1, "skewX": 0, "skewY": 0, "x": 0, "y": 0 }
```

with **two** scale variants observed:

- `scale: 1` — default (no scale change, opacity-only fade)
- `scale: 1.1` — single use on the hero image (`aqy98i`), pairs with the `delay 0.4 / dur 3 / ease [0,0,0,1]` tween. a slow zoom-out: image enters at 110% and settles to 100% over 3 seconds.

> **opacity 0.001 trick** is preserved — framer keeps the element in the gpu compositing layer but invisible. emulate exactly (don't shortcut to `0`) to match perceived crispness when content reveals.

## directional pattern: stagger by delay, not by y

unlike many framer templates (and unlike yuya which uses y-deltas of -100 / 175 / 265 / 485), moment **does not translate** content on appear. y-initials are `0` everywhere measured. the cinematic reveal is purely:

1. opacity 0.001 → 1
2. (optionally) scale 1.1 → 1 on the hero image
3. (optionally) `transformTemplate: "translateX(-50%)"` to center elements horizontally without animating x

stagger choreography lives entirely in the `delay` field:

- wave 0: `delay: 0` (most content)
- wave 1: `delay: 0.4` (hero image scale-out)
- wave 2: `delay: 0.6` (mid-stagger)
- wave 3: `delay: 1.2` (post-hero supporting content)

## css transitions (sparse — framer uses js engine)

only one css transition appears in inline style:

- `transition: color .2s cubic-bezier(0,0,1,1) 0s` — link/button hover color transition. note `cubic-bezier(0,0,1,1)` is **identity / linear** — framer authored this as the literal `linear` curve.

a dynamic `cubic-bezier(${e}, ${t}, ${r}, ${o})` template appears in framer's runtime js — that's the engine, not an authored value.

## per-page motion summary

### / (homepage, index.html)
- `aqy98i` — hero image: `delay 0.4, dur 3s, ease [0,0,0,1]`, `scale 1.1 → 1`. the slow zoom-out is the signature motion of the page.
- `w1uy2y` — late content: `delay 1.2, dur 1.8s, ease [0.12,0.23,0.5,1]`, opacity-only.
- `1ctefwc` — centered overlay: `delay 0.6, dur 1.6s, ease [0,0,0,1]`, opacity-only, `transformTemplate: translate(-50%, -50%)`.
- everything else: spring 0.2 / 1.2s, mostly `delay 0` with a few `delay 1.2`.

### /about, /gallery, /contact, /journal
- only the default spring transitions appear (`bounce 0.2, delay 0, duration 1.2`) plus the post-hero spring at `delay 1.2`. no page-unique tweens. each page has roughly the same hero-then-cascade rhythm.

### /gallery/[slug] and /journal/[slug]
- inherit the same default spring set. these are content-driven pages — entrance is brief, identical pattern.

## breakpoints in motion data

framer encodes per-breakpoint variants under hash keys:

| route   | desktop ≥1440 | tablet 940-1439 | mobile ≤939 |
|---------|---------------|------------------|-------------|
| home    | `72rtr7`      | `tkprz8`         | `1hkj5l6`   |
| about   | `w91ub7`      | `1ogh77l`        | `mm8pbb`    |
| gallery | `qorhwo`      | `6quzgd`         | `18fkq3f`   |
| contact | `1ee8b1l`     | `1yv0zmv`        | `w9i6pd`    |
| journal | `1gubeyk`     | `19srvj2`        | `1dmj143`   |

shared cross-page hashes `sxab1s / 1wn4qzw / 7gjd2u` appear on every non-home page — likely the global header / footer appear sets.

per-breakpoint motion in this template is **identical to default in 95% of cases** — i scanned for variant overrides and they reuse the same transition object. the primary breakpoint difference is layout, not motion.

## framer-motion → port mapping

framer-motion springs with `bounce: 0.2` translate to a soft, slightly-overshooting curve. equivalents:

- **port to framer-motion (recommended)**: keep `{ type: 'spring', bounce: 0.2, duration }` verbatim. framer-motion's `bounce` is a high-level prop that maps internally to stiffness/damping.
- **port to gsap**: use `power2.out` for the spring approximation (no overshoot — close, not exact). for tweened eases:
  - `[0,0,0,1]` → custom `CustomEase.create("moment-out", "0,0,0,1")` (extreme ease-out, all motion at the start).
  - `[0.12,0.23,0.5,1]` → `power3.out` is a reasonable analog.
  - `[0,0,1,1]` → `none` / `linear`.
- **port to css**: `transition: 1.2s cubic-bezier(0.16, 1, 0.3, 1)` is a workable spring-like swap if you can't bring framer-motion in.

## known gaps

- [ ] **hover states** — not catalogued. only the global `color .2s linear` transition was found in inline css. card/image hover scaling, if any, lives in framer runtime js (`__framer/main.js`-style chunk).
- [ ] **scroll-linked behavior** — framer's `whileInView` / IntersectionObserver-based reveals were not surfaced as separate variants in the appear json. likely the site uses the engine's default in-view trigger; scroll parallax was not observed visually.
- [ ] **page transitions** — framer ships a default page transition that's not encoded in the per-page json. likely a cross-fade.
- [ ] **scroll progress / sticky** — gallery and journal index pages have masonry-style image grids. could not confirm if any image has scroll-scrub from static html alone.
- [ ] **mobile-specific motion** — variant hashes exist but do not differ from desktop in the cases inspected.

second forensics pass (with chrome devtools performance recording during a real scroll) is needed to capture hover + scroll behaviors. the static-html mirror is the right oracle for entrance animations only.

## artifact origin

extracted by grep + python aggregation over `<script type="framer/appear">` blocks across 14 mirror html files. raw transition counts are deduplicated string-matches; ease values verified against multiple pages. css transitions found via `grep -oE 'transition[^"}>]*'` on each route.
