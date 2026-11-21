/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        slate: {
          50: '#faf7ff', 100: '#f3eefc', 200: '#e6dff3', 300: '#d3cbe4', 400: '#b3aac9', 500: '#968db0',
          600: '#6f6788', 700: '#4b4568', 800: '#2b2644', 900: '#1a1730', 950: '#0f0d1c',
        },
        sky: {
          50: '#fff7ed', 100: '#ffecd6', 200: '#ffd9b0', 300: '#ffbd80', 400: '#ff9a3d', 500: '#f27a12',
          600: '#d9600a', 700: '#b34a0c', 800: '#8f3b10', 900: '#753211', 950: '#431a07',
        },
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
