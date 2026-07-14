import type { Config } from 'tailwindcss';

const config: Config = {
  content: {
    relative: true,
    files: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './layouts/**/*.{ts,tsx}'],
  },
  theme: {
    extend: {
      colors: {
        primary: '#020833',
        secondary: '#0367A0',
        accent: '#6494b1',
        success: '#097a0b',
        active: '#146316',
        error: '#c10021',
      },
      borderRadius: {
        card: '16px',
      },
    },
  },
  plugins: [],
};

export default config;
