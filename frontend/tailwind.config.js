/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          900: '#0a0d14',
          800: '#0f1422',
          700: '#171f33',
          600: '#222d4a',
        },
        rg: {
          emerald: '#10b981',
          amber: '#f59e0b',
          rose: '#ef4444',
          cyan: '#06b6d4',
          blue: '#3b82f6',
          indigo: '#6366f1',
        }
      }
    },
  },
  plugins: [],
}
