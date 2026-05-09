import type { Config } from "tailwindcss";

// design tokens extracted from /Users/stephenhung/Documents/GitHub/angel/reference/moment/tokens.json
// methodology: preserve moment.framer.photos's monochrome warmth — chrome stays in moment's palette,
// angel's tonal voice comes from typography (instrument serif italic wordmark + manrope body)
// and content, not from color injection.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // pink/white kawaii palette — angel pivot from moment's monochrome
        paper: "#fffafc",        // warm-white with sakura tint
        cloud: "#ffffff",        // pure white surfaces
        soft: "#fff0f5",         // pale pink soft surface
        hairline: "#ffd6e3",     // hairline borders, sakura tint
        muted: {
          tertiary: "#d99fb5",   // pale dusty pink
          secondary: "#b87592",  // mid muted pink
          deep: "#7a3e58",       // deep muted pink for body
        },
        ink: {
          near: "#1a0a12",       // near-black with subtle pink tint
          primary: "#0a0507",    // primary text — keep dark for legibility
        },
        // pink brand colors (angel-coded)
        sakura: {
          50: "#fff5f9",
          100: "#ffe5ee",        // pale pink bg
          200: "#ffb7c5",        // soft sakura
          300: "#ff95b3",        // light pink
          400: "#ff6f9d",        // medium pink
          500: "#ff4f8b",        // hot pink — primary brand
          600: "#e63a73",        // saturated pink
          700: "#c73e73",        // deep pink — shadows + dark sections
          800: "#9c2a55",        // very deep pink
          900: "#6e1a3a",        // darkest pink — near-black
        },
      },
      fontFamily: {
        sans: ["var(--font-manrope)", "system-ui", "sans-serif"],
        display: ["var(--font-instrument-serif)", "Georgia", "serif"],
        mono: ["var(--font-fragment-mono)", "ui-monospace", "monospace"],
        // kawaii sticker-style display — Bagel Fat One is the SAWARATSUKI vibe
        bagel: ["var(--font-bagel)", "system-ui", "sans-serif"],
        mochiy: ["var(--font-mochiy)", "system-ui", "sans-serif"],
        // jp rounded brush for kanji body
        klee: ["var(--font-klee)", "ui-serif", "serif"],
        // jp serif for the bait kanji reveal
        notoJP: ["var(--font-noto-serif-jp)", "ui-serif", "serif"],
      },
      fontSize: {
        // type scale extracted from typography.json — moment's authored sizes
        "display-xl": ["160px", { lineHeight: "1", letterSpacing: "-0.04em", fontWeight: "500" }],
        "display-lg": ["64px", { lineHeight: "1.1", letterSpacing: "-0.02em", fontWeight: "600" }],
        "display-md": ["45px", { lineHeight: "1.15", letterSpacing: "-0.01em", fontWeight: "600" }],
        "display-sm": ["32px", { lineHeight: "1.2", letterSpacing: "-0.005em", fontWeight: "500" }],
        kicker: ["28px", { lineHeight: "1.25", fontWeight: "600" }],
        "body-lg": ["20px", { lineHeight: "1.5", fontWeight: "500" }],
        body: ["16px", { lineHeight: "1.5", fontWeight: "400" }],
        meta: ["14px", { lineHeight: "1.4", fontWeight: "600" }],
        caption: ["12px", { lineHeight: "1.3", fontWeight: "400" }],
      },
      spacing: {
        // page-edge gutter scaling from tokens.json
        "gutter-mobile": "16px",
        "gutter-tablet": "40px",
        "gutter-desktop": "100px",
        // section vertical rhythm
        "section-top-d": "160px",
        "section-top-m": "120px",
        "section-bottom": "60px",
      },
      borderRadius: {
        none: "0px",
        sm: "8px",
        md: "12px",
        pill: "999px",
      },
      maxWidth: {
        canvas: "1440px",
        content: "1240px",
      },
      screens: {
        // moment uses 2 real breakpoints, not 3. mirror that.
        "tablet": "940px",
        "desktop": "1440px",
      },
      transitionTimingFunction: {
        // authored cubic-beziers from motion-spec.md
        "moment-out": "cubic-bezier(0,0,0,1)",
        "moment-late": "cubic-bezier(0.12,0.23,0.5,1)",
      },
    },
  },
  plugins: [],
};

export default config;
