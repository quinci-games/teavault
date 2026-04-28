/** @type {import('tailwindcss').Config} */
import typography from '@tailwindcss/typography';

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        tea: {
          50:  '#f3f8f2',
          100: '#e2efe0',
          200: '#c5dfc1',
          300: '#9cc796',
          400: '#70a968',
          500: '#4f8c47',
          600: '#3c7236',
          700: '#305a2d',
          800: '#294826',
          900: '#223c21',
          950: '#0f2010',
        },
      },
    },
  },
  plugins: [typography],
};
