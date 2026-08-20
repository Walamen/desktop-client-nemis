import type { Config } from 'tailwindcss';

const config: Config = {
  content: {
    relative: true,
    files: [
      './app/**/*.{ts,tsx}',
      './components/**/*.{ts,tsx}',
      './lib/**/*.{ts,tsx}',
      '../../../packages/ui/src/**/*.{ts,tsx}',
    ],
  },
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#000e21',
          50: '#E6EBF0',
          100: '#B3C2CC',
          200: '#8099A8',
          300: '#4D7085',
          400: '#26556A',
          500: '#000e21', // base
          600: '#000C1D',
          700: '#000A19',
          800: '#000815',
          900: '#000611',
        },
        secondary: {
          DEFAULT: '#0367A0',
          50: '#E6F4FA',
          100: '#B3D9ED',
          200: '#80BFE0',
          300: '#4DA5D3',
          400: '#268FC8',
          500: '#0367A0', // base
          600: '#025A8C',
          700: '#024D78',
          800: '#013F64',
          900: '#013250',
        },
        accent: {
          DEFAULT: '#1874A8',
          50: '#E8F3F9',
          100: '#C6E0EF',
          200: '#A3CDE5',
          300: '#80B9DB',
          400: '#5EA8D2',
          500: '#1874A8', // base
          600: '#156896',
          700: '#125A82',
          800: '#0F4C6E',
          900: '#0C3E5A',
        },
        neutral: {
          dark: '#000000',
          light: '#e3e3e5',
        },
        border: '#e3e3e5',
        success: '#065808',
        active: '#146316',
        pending: '#a6731c',
        error: '#c10021',
      },
      screens: {
        '3xl': '1920px',
      },
      fontFamily: {
        sans: ['var(--font-lato)', 'system-ui', 'sans-serif'],
        heading: [
          'var(--font-crete-round)',
          'var(--font-poppins)',
          'system-ui',
          'sans-serif',
        ],
      },
      fontSize: {
        h1: ['42px', { lineHeight: '1.2', fontWeight: '700' }],
        h2: ['32px', { lineHeight: '1.3', fontWeight: '600' }],
        h3: ['24px', { lineHeight: '1.4', fontWeight: '600' }],
        h4: ['20px', { lineHeight: '1.4', fontWeight: '600' }],
        body: ['16px', { lineHeight: '1.6', fontWeight: '400' }],
        small: ['14px', { lineHeight: '1.5', fontWeight: '400' }],
        button: ['15px', { lineHeight: '1.5', fontWeight: '500' }],
      },
      borderRadius: {
        card: '16px',
        button: '9999px',
      },
      spacing: {
        card: '32px',
      },
      keyframes: {
        'toast-in': {
          '0%': { opacity: '0', transform: 'translateX(100%)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'toast-out': {
          '0%': { opacity: '1', transform: 'translateX(0)' },
          '100%': { opacity: '0', transform: 'translateX(100%)' },
        },
      },
      animation: {
        'toast-in': 'toast-in 200ms ease-out',
        'toast-out': 'toast-out 200ms ease-in forwards',
      },
    },
  },
  plugins: [],
};

export default config;
