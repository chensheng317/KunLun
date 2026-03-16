
/** @type {import('tailwindcss').Config} */
export default {
  content: [
  './index.html',
  './src/**/*.{js,ts,jsx,tsx}'
],
  theme: {
    extend: {
      colors: {
        'nexus-bg': '#161823',
        'nexus-surface': '#2D2B38',
        'nexus-surface-alt': '#053154',
        'nexus-primary': '#3eede7',
        'nexus-secondary': '#5EB8AC',
        'nexus-text': '#E0E6ED',
        'nexus-muted': '#7D8A99',
        'nexus-border': '#3A3F58',
      },
      boxShadow: {
        'cyber-glow': '0 0 15px rgba(62, 237, 231, 0.3)',
        'cyber-glow-strong': '0 0 25px rgba(62, 237, 231, 0.5)',
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { opacity: '1', boxShadow: '0 0 10px rgba(62, 237, 231, 0.5)' },
          '50%': { opacity: '.5', boxShadow: '0 0 2px rgba(62, 237, 231, 0.2)' },
        }
      }
    },
  },
  plugins: [],
}
