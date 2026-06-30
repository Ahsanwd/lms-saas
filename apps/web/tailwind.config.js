/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Primary uses CSS vars so brand color applies at runtime without rebuild
        primary: {
          50:  'hsl(var(--primary-h) var(--primary-s) 97%)',
          100: 'hsl(var(--primary-h) var(--primary-s) 93%)',
          200: 'hsl(var(--primary-h) var(--primary-s) 85%)',
          300: 'hsl(var(--primary-h) var(--primary-s) 74%)',
          400: 'hsl(var(--primary-h) var(--primary-s) 62%)',
          500: 'hsl(var(--primary-h) var(--primary-s) 52%)',
          600: 'hsl(var(--primary-h) var(--primary-s) 43%)',
          700: 'hsl(var(--primary-h) var(--primary-s) 34%)',
          800: 'hsl(var(--primary-h) var(--primary-s) 25%)',
          900: 'hsl(var(--primary-h) var(--primary-s) 16%)',
        },
        // Secondary uses the same CSS-var pattern as primary
        secondary: {
          50:  'hsl(var(--secondary-h) var(--secondary-s) 97%)',
          100: 'hsl(var(--secondary-h) var(--secondary-s) 93%)',
          200: 'hsl(var(--secondary-h) var(--secondary-s) 85%)',
          300: 'hsl(var(--secondary-h) var(--secondary-s) 74%)',
          400: 'hsl(var(--secondary-h) var(--secondary-s) 62%)',
          500: 'hsl(var(--secondary-h) var(--secondary-s) 52%)',
          600: 'hsl(var(--secondary-h) var(--secondary-s) 43%)',
          700: 'hsl(var(--secondary-h) var(--secondary-s) 34%)',
          800: 'hsl(var(--secondary-h) var(--secondary-s) 25%)',
          900: 'hsl(var(--secondary-h) var(--secondary-s) 16%)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
