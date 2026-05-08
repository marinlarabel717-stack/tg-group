import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: '#08111f',
        panel: '#0d1726',
        card: '#111c2d',
        hover: '#162235',
        line: '#243553',
        neon: '#3b82f6',
        neonSoft: '#60a5fa',
        success: '#22c55e',
        danger: '#ef4444',
        warning: '#f59e0b',
        textMain: '#f8fafc',
        textMuted: '#94a3b8'
      },
      boxShadow: {
        glass: '0 2px 8px rgba(8, 15, 30, 0.14)',
        neon: '0 0 0 1px rgba(59,130,246,0.18)',
        panel: '0 4px 16px rgba(2, 8, 23, 0.18)'
      },
      borderRadius: {
        '4xl': '2rem'
      },
      backgroundImage: {
        cyber: 'linear-gradient(180deg, rgba(11,18,32,1), rgba(15,23,42,1))'
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-4px)' }
        },
        pulseLine: {
          '0%, 100%': { opacity: '0.55' },
          '50%': { opacity: '0.72' }
        }
      },
      animation: {
        float: 'float 4s ease-in-out infinite',
        pulseLine: 'pulseLine 3.8s ease-in-out infinite'
      }
    }
  },
  plugins: []
} satisfies Config
