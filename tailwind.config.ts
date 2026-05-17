import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        nexus: {
          ink: '#0f172a',
          teal: '#0f766e',
          mint: '#ccfbf1',
          lime: '#84cc16',
          amber: '#f59e0b',
          coral: '#f97316'
        }
      },
      boxShadow: {
        soft: '0 10px 30px rgba(15, 23, 42, 0.08)'
      }
    }
  },
  plugins: []
} satisfies Config;
