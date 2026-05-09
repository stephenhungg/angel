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
        paper: "#fffdfe",        // near-white with the lightest pink tint
        cloud: "#ffffff",        // pure white surfaces
        soft: "#fff5fa",         // pale pink soft surface
        hairline: "#ffe6ee",     // hairline borders, soft sakura tint
        muted: {
          tertiary: "#e8b4c5",   // pale dusty pink
          secondary: "#b07c92",  // mid muted pink
          deep: "#624054",       // deep muted plum for body
        },
        ink: {
          near: "#1a0a12",       // near-black w/ subtle pink tint
          primary: "#0a0507",    // primary text — keep dark for legibility
        },
        // pink brand colors — softer, lighter sakura palette
        sakura: {
          50: "#fffbfd",
          100: "#fff0f6",        // very pale pink bg
          200: "#ffd9e6",        // soft sakura
          300: "#ffbcd0",        // light pink
          400: "#ffa1bd",        // medium soft pink — primary brand
          500: "#ff85a8",        // brand accent (was much hotter before)
          600: "#ec6592",        // saturated pink
          700: "#c84e7a",        // deep pink
          800: "#9b3a5f",        // very deep pink
          900: "#5e2640",        // dark dusty rose — near-black for dark sections
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
