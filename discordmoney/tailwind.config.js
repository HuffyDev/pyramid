/** Discord's own dark-theme palette (2023+ refresh), used as design tokens. */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        page: '#313338', // primary background (chat)
        card: '#2B2D31', // secondary background (sidebar)
        deep: '#232428', // user panel / inset
        rail: '#1E1F22', // tertiary background (server rail, search inputs)
        input: '#1E1F22',
        line: '#3F4147',
        hover: '#35373C',
        active: '#404249',
        chip: '#4E5058',
        ink: {
          DEFAULT: '#F2F3F5', // header primary
          body: '#DBDEE1', // text normal
          soft: '#B5BAC1', // interactive normal / header secondary
          mute: '#949BA4', // text muted
          dim: '#80848E',
        },
        blurple: {
          DEFAULT: '#5865F2',
          hover: '#4752C4',
          press: '#3C45A5',
          light: '#949CF7',
          pale: '#C9CDFB',
        },
        mint: { DEFAULT: '#23A55A', bright: '#57F287' },
        gold: '#F0B232',
        danger: { DEFAULT: '#F23F43', btn: '#DA373C' },
        fuchsia: '#EB459E',
        link: '#00A8FC',
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      maxWidth: { shell: '1040px' },
      opacity: { 12: '0.12', 15: '0.15', 35: '0.35', 45: '0.45', 55: '0.55', 85: '0.85' },
      boxShadow: {
        card: '0 1px 0 rgba(4,4,5,0.2), 0 1.5px 0 rgba(6,6,7,0.05), 0 2px 0 rgba(4,4,5,0.05)',
        pop: '0 8px 16px rgba(0,0,0,0.24), 0 0 0 1px rgba(255,255,255,0.04)',
        glow: '0 0 0 1px rgba(88,101,242,0.5), 0 8px 30px -8px rgba(88,101,242,0.55)',
      },
      keyframes: {
        'fade-in': { from: { opacity: 0 }, to: { opacity: 1 } },
        'pop-in': { from: { opacity: 0, transform: 'translateY(6px) scale(0.98)' }, to: { opacity: 1, transform: 'none' } },
        'slide-in': { from: { transform: 'translateX(100%)' }, to: { transform: 'none' } },
        'toast-in': { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'none' } },
      },
      animation: {
        'fade-in': 'fade-in 140ms ease-out',
        'pop-in': 'pop-in 160ms cubic-bezier(.2,.8,.2,1)',
        'slide-in': 'slide-in 200ms cubic-bezier(.2,.8,.2,1)',
        'toast-in': 'toast-in 180ms ease-out',
      },
    },
  },
  plugins: [],
};
