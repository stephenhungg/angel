import type { Config } from 'tailwindcss';

/**
 * Tailwind config for desktop — mirrors web/tailwind.config.ts so components
 * port over with no class rewrites. Scoped to onboarding components only;
 * the rest of the renderer keeps using inline styles + styles.css.
 */
const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#fffdfe',
        cloud: '#ffffff',
        soft: '#fff5fa',
        hairline: '#ffe6ee',
        muted: {
          tertiary: '#e8b4c5',
          secondary: '#b07c92',
          deep: '#624054',
        },
        ink: {
          near: '#1a0a12',
          primary: '#0a0507',
        },
        sakura: {
          50: '#fffbfd',
          100: '#fff0f6',
          200: '#ffd9e6',
          300: '#ffbcd0',
          400: '#ffa1bd',
          500: '#ff85a8',
          600: '#ec6592',
          700: '#c84e7a',
          800: '#9b3a5f',
          900: '#5e2640',
        },
      },
      fontFamily: {
        sans: ['Manrope', 'system-ui', 'sans-serif'],
        display: ['"Instrument Serif"', 'Georgia', 'serif'],
        mono: ['"Fragment Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        none: '0px',
        sm: '8px',
        md: '12px',
        pill: '999px',
      },
    },
  },
  plugins: [],
};

export default config;
