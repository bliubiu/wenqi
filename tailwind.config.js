/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        dynasty: {
          preqin: '#3A4A5C',
          han: '#8B7355',
          weijin: '#6FAE8E',
          tang: '#D4A24C',
          song: '#7BA7D9',
          yuan: '#B5523E',
          ming: '#C9866B',
          qing: '#8C6FAE',
          modern: '#5A8C7A',
        },
        glass: {
          DEFAULT: 'rgba(0,0,0,0.6)',
          light: 'rgba(0,0,0,0.5)',
          medium: 'rgba(0,0,0,0.7)',
          heavy: 'rgba(0,0,0,0.85)',
        },
      },
      fontFamily: {
        sans: ['Noto Sans SC', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'display': ['1.75rem', { lineHeight: '2.25rem', fontWeight: '700' }],
        'title': ['1.25rem', { lineHeight: '1.75rem', fontWeight: '600' }],
        'body': ['0.875rem', { lineHeight: '1.5rem' }],
        'caption': ['0.75rem', { lineHeight: '1rem' }],
      },
      keyframes: {
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in-scale': {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(100%)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 8px rgba(255,255,255,0.1)' },
          '50%': { boxShadow: '0 0 20px rgba(255,255,255,0.2)' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        'breathe': {
          '0%, 100%': { opacity: '0.6', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.05)' },
        },
      },
      animation: {
        'fade-in-up': 'fade-in-up 0.3s ease-out',
        'fade-in-scale': 'fade-in-scale 0.25s ease-out',
        'slide-up': 'slide-up 0.35s ease-out',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'float': 'float 3s ease-in-out infinite',
        'breathe': 'breathe 3s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
