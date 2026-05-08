import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: '#07111f',
        panel: '#0f1c31',
        card: '#13233f',
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
        glass: '0 6px 18px rgba(8, 15, 30, 0.22)',
        neon: '0 0 0 1px rgba(59,130,246,0.28), 0 0 10px rgba(59,130,246,0.12)',
        panel: '0 10px 28px rgba(2, 8, 23, 0.28)'
      },
      borderRadius: {
        '4xl': '2rem'
      },
      backgroundImage: {
        cyber: 'radial-gradient(circle at top left, rgba(59,130,246,0.10), transparent 24%), linear-gradient(180deg, rgba(7,17,31,0.98), rgba(8,14,26,1))'
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-4px)' }
        },
        pulseLine: {
          '0%, 100%': { opacity: '0.55' },
          '50%': { opacity: '0.85' }
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
