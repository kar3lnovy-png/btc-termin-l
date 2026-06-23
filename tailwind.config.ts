import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: '#F7931A',
        confirmed: '#22C55E',
        error: '#EF4444',
        bg: '#0A0A0A',
        surface: '#141414',
        border: '#2A2A2A',
        text: '#F5F5F5',
        muted: '#6B6B6B'
      },
      fontFamily: {
        display: ['var(--font-display)', 'Space Grotesk', 'sans-serif'],
        mono: ['var(--font-mono)', 'JetBrains Mono', 'monospace']
      }
    }
  },
  plugins: []
}

export default config
