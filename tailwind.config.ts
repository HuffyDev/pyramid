import type { Config } from 'tailwindcss';

export default {
  content: ['./client/index.html', './client/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // desert night: near-black indigo sky
        night: {
          950: '#04050c',
          900: '#070915',
          850: '#0a0d1e',
          800: '#0f1329',
          750: '#141935',
          700: '#1b2142',
          600: '#283057',
          500: '#444c78',
          400: '#7a7f9f',
          300: '#a7a7bb',
        },
        // warm sandstone
        sand: {
          50: '#fbf4e4',
          100: '#f3e5c6',
          200: '#e6cc98',
          300: '#d5b072',
          400: '#bf9356',
          500: '#9f7643',
          600: '#7c5b34',
          700: '#5a4227',
          800: '#3a2b1b',
          900: '#21180f',
        },
        // the one hot accent: capstone + CTAs
        gold: {
          DEFAULT: '#ffb52e',
          hot: '#ffd36e',
          deep: '#d98b0b',
          soft: '#ffb52e1f',
        },
        bad: '#e8735a',
        ok: '#a6d189',
      },
      fontFamily: {
        display: ['Cinzel', 'ui-serif', 'Georgia', 'serif'],
        sans: ['"Hanken Grotesk"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      letterSpacing: { monument: '0.18em', tightest: '-0.03em' },
      boxShadow: {
        gold: '0 0 0 1px #ffb52e66, 0 8px 32px -8px #ffb52e99',
        'gold-lg': '0 0 140px -30px #ffb52e66',
        sheet: '0 -20px 80px -20px #000000cc',
      },
      keyframes: {
        rise: { from: { opacity: '0', transform: 'translateY(10px)' }, to: { opacity: '1', transform: 'none' } },
        sheet: { from: { transform: 'translateY(100%)' }, to: { transform: 'none' } },
        fade: { from: { opacity: '0' }, to: { opacity: '1' } },
        marquee: { from: { transform: 'translateX(0)' }, to: { transform: 'translateX(-50%)' } },
        breathe: { '0%,100%': { opacity: '.55' }, '50%': { opacity: '1' } },
        shimmer: { from: { backgroundPosition: '-200% 0' }, to: { backgroundPosition: '200% 0' } },
      },
      animation: {
        rise: 'rise .55s cubic-bezier(.2,.7,.2,1) both',
        sheet: 'sheet .5s cubic-bezier(.2,.8,.2,1) both',
        fade: 'fade .4s ease both',
        marquee: 'marquee 60s linear infinite',
        breathe: 'breathe 3.2s ease-in-out infinite',
        shimmer: 'shimmer 3s linear infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
