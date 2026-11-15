/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        obsidian: {
          950: '#090A0F',
          900: '#0F1117',
          800: '#151821',
          700: '#1C202C',
        },
        indigo: {
          accent: '#5865F2',
          hover: '#4752C4',
        },
        emerald: {
          voice: '#10B981',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'SFMono-Regular', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
