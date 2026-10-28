/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // SpareSlot palette. accent is for borders, rings and text on ink only: it fails contrast as text on white.
        ink: { DEFAULT: '#17252A', soft: '#2F4146' },
        brand: { DEFAULT: '#2B7A78', dark: '#215F5D', light: '#E6F3F2' },
        accent: '#3AAFA9',
        mist: { DEFAULT: '#DEF2F1', soft: '#EEF8F7' },
      },
      boxShadow: {
        card: '0 1px 2px rgba(23, 37, 42, 0.06), 0 1px 3px rgba(23, 37, 42, 0.08)',
      },
    },
  },
  plugins: [],
};
