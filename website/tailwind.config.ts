import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      colors: {
        cream: '#FAF6EC',
        ink: '#111111',
        yellow: { DEFAULT: '#FFE500', 400: '#FFE500' },
        eq: '#30D158',
        rnn: '#64D2FF',
        deep: '#BF5AF2',
      },
      keyframes: {
        marqueeScroll: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        barNoise: {
          '0%': { transform: 'scaleY(0.15)' },
          '20%': { transform: 'scaleY(1.4)' },
          '40%': { transform: 'scaleY(0.2)' },
          '60%': { transform: 'scaleY(1.7)' },
          '80%': { transform: 'scaleY(0.1)' },
          '100%': { transform: 'scaleY(1.2)' },
        },
        barClean: {
          '0%': { transform: 'scaleY(0.55)' },
          '50%': { transform: 'scaleY(1)' },
          '100%': { transform: 'scaleY(0.55)' },
        },
        floatUp: {
          '0%, 100%': { transform: 'translateY(0px) rotate(-1deg)' },
          '50%': { transform: 'translateY(-10px) rotate(1deg)' },
        },
        fadeSlideUp: {
          from: { opacity: '0', transform: 'translateY(40px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        spinSlow: {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
        glitch: {
          '0%, 100%': { transform: 'none', filter: 'none' },
          '20%': { transform: 'translate(3px, -2px)', filter: 'hue-rotate(90deg)' },
          '40%': { transform: 'translate(-3px, 2px)', filter: 'hue-rotate(-90deg)' },
          '60%': { transform: 'translate(2px, 3px)', filter: 'none' },
          '80%': { transform: 'translate(-2px, -3px)', filter: 'hue-rotate(45deg)' },
        },
        pulse2: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
      },
      animation: {
        marquee: 'marqueeScroll 22s linear infinite',
        barNoise: 'barNoise 0.6s ease-in-out infinite alternate',
        barClean: 'barClean 0.9s ease-in-out infinite alternate',
        float: 'floatUp 3.5s ease-in-out infinite',
        'spin-slow': 'spinSlow 14s linear infinite',
        glitch: 'glitch 0.4s step-end',
        pulse2: 'pulse2 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}

export default config
