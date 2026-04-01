'use client'

import React, { useEffect, useRef, useState } from 'react'

const GITHUB_URL = 'https://github.com/harsh2929/yt-declicker'

// Words that cycle in the hero headline
const TYPING_WORDS = ['CLACK', 'CLICK', 'TIP TAP', 'THUD', 'CLATTER', 'RAT-TAT', 'TAP TAP', 'TICK TACK']

// Keyboard rows for the animated keyboard visual
const KEY_ROWS = [
  ['Q','W','E','R','T','Y','U','I','O','P'],
  ['A','S','D','F','G','H','J','K','L'],
  ['Z','X','C','V','B','N','M'],
]

// Noise types for the feature request form
const NOISE_TYPES = [
  { id: 'mouse',    label: 'Mouse clicks',        emoji: '🖱' },
  { id: 'fan',      label: 'Fan / AC noise',       emoji: '💨' },
  { id: 'music',    label: 'Background music',     emoji: '🎵' },
  { id: 'echo',     label: 'Echo / reverb',        emoji: '🔊' },
  { id: 'crowd',    label: 'Crowd noise',          emoji: '👥' },
  { id: 'rain',     label: 'Rain / weather',       emoji: '🌧' },
  { id: 'dog',      label: 'Dog barking',          emoji: '🐕' },
  { id: 'hum',      label: 'Electrical hum',       emoji: '⚡' },
  { id: 'other',    label: 'Other',                emoji: '🔇' },
]

function GitHubIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

// Waveform bar heights ─ hardcoded to avoid SSR/client hydration mismatch
const NOISY_BARS = [
  12, 10, 9, 76, 11, 8, 13, 84, 9, 7, 11, 10, 72, 8, 12, 9, 90, 10, 7, 14,
  9, 80, 8, 11, 10, 6, 86, 9, 12, 13, 74, 8, 11, 88, 7, 10, 9, 70, 11, 8,
]
const CLEAN_BARS = [
  33, 37, 41, 44, 46, 43, 39, 33, 27, 22, 19, 18, 20, 24, 30, 36, 41, 44,
  45, 42, 37, 31, 25, 21, 19, 20, 23, 28, 35, 41, 44, 44, 41, 36, 30, 24,
  21, 20, 22, 27,
]

const FLOATING_KEYS = [
  { char: '↵', x: '8%',  y: '22%', rot: '-8deg',  dur: '3.2s', delay: '0s'    },
  { char: '⌫', x: '14%', y: '68%', rot: '5deg',   dur: '4.1s', delay: '0.6s'  },
  { char: 'k', x: '4%',  y: '45%', rot: '-4deg',  dur: '3.7s', delay: '1.2s'  },
  { char: '⇥', x: '88%', y: '30%', rot: '7deg',   dur: '3.4s', delay: '0.3s'  },
  { char: 'e', x: '92%', y: '60%', rot: '-6deg',  dur: '4.3s', delay: '0.9s'  },
  { char: '⌃', x: '80%', y: '75%', rot: '4deg',   dur: '3.8s', delay: '1.5s'  },
  { char: 's', x: '18%', y: '85%', rot: '-10deg', dur: '3.6s', delay: '0.4s'  },
  { char: '⇧', x: '75%', y: '15%', rot: '9deg',   dur: '4.0s', delay: '1.8s'  },
  { char: 'a', x: '55%', y: '88%', rot: '-3deg',  dur: '3.3s', delay: '0.7s'  },
  { char: '⌘', x: '48%', y: '12%', rot: '6deg',   dur: '4.5s', delay: '1.1s'  },
]

// ─────────────────────────────────────────────────────────────────────────────
// HOOK: scroll reveal
// ─────────────────────────────────────────────────────────────────────────────
function useReveal() {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect() } },
      { threshold: 0.12 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return { ref, visible }
}

// ─────────────────────────────────────────────────────────────────────────────
// DYNAMIC WORD — cycles through keyboard sound words
// ─────────────────────────────────────────────────────────────────────────────
function DynamicWord() {
  const [idx, setIdx] = useState(0)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    const id = setInterval(() => {
      setLeaving(true)
      setTimeout(() => {
        setIdx(i => (i + 1) % TYPING_WORDS.length)
        setLeaving(false)
      }, 220)
    }, 1700)
    return () => clearInterval(id)
  }, [])

  return (
    <span
      style={{
        display: 'inline-block',
        transition: 'transform 0.22s cubic-bezier(0.4,0,0.2,1), opacity 0.22s ease',
        transform: leaving ? 'translateY(-40px) scaleY(0.6)' : 'translateY(0) scaleY(1)',
        opacity: leaving ? 0 : 1,
        minWidth: '7ch',
        textAlign: 'center',
      }}
    >
      {TYPING_WORDS[idx]}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// KEYBOARD VISUAL — animated keys that randomly "press"
// ─────────────────────────────────────────────────────────────────────────────
function KeyboardVisual() {
  const [pressed, setPressed] = useState<Set<string>>(new Set())
  const [justFiltered, setJustFiltered] = useState<Set<string>>(new Set())

  useEffect(() => {
    let alive = true

    const pressKey = () => {
      if (!alive) return
      const row = KEY_ROWS[Math.floor(Math.random() * KEY_ROWS.length)]
      const key = row[Math.floor(Math.random() * row.length)]

      // Key turns red (noise) for 120ms then green (filtered) briefly
      setPressed(p => new Set([...p, key]))
      setTimeout(() => {
        setPressed(p => { const n = new Set(p); n.delete(key); return n })
        setJustFiltered(p => new Set([...p, key]))
        setTimeout(() => {
          setJustFiltered(p => { const n = new Set(p); n.delete(key); return n })
        }, 280)
      }, 120)

      // Schedule next key(s) — typing bursts
      const nextDelay = Math.random() < 0.5 ? 80 + Math.random() * 80 : 400 + Math.random() * 800
      setTimeout(pressKey, nextDelay)
    }

    const t = setTimeout(pressKey, 600)
    return () => { alive = false; clearTimeout(t) }
  }, [])

  return (
    <div className="flex flex-col items-center gap-1.5 select-none" aria-hidden>
      {KEY_ROWS.map((row, ri) => (
        <div key={ri} className="flex gap-1.5" style={{ paddingLeft: `${ri * 10}px` }}>
          {row.map(key => {
            const isPressed  = pressed.has(key)
            const isFiltered = justFiltered.has(key)
            return (
              <div
                key={key}
                className="font-mono font-black text-[11px] flex items-center justify-center border-2 border-ink rounded-sm"
                style={{
                  width: 30, height: 30,
                  backgroundColor: isPressed ? '#FF3B30' : isFiltered ? '#30D158' : '#FAF6EC',
                  color:           isPressed ? '#fff'    : isFiltered ? '#fff'    : '#111',
                  transform:       isPressed ? 'translateY(2px)' : 'translateY(0)',
                  boxShadow:       isPressed ? '0 0 0 #111' : '0 2px 0 #111',
                  transition:      'all 0.06s ease',
                }}
              >
                {key}
              </div>
            )
          })}
        </div>
      ))}
      {/* Space bar */}
      <div
        className="border-2 border-ink rounded-sm font-mono font-black text-[9px] flex items-center justify-center"
        style={{ width: 160, height: 24, backgroundColor: '#FAF6EC', boxShadow: '0 2px 0 #111' }}
      >
        SPACE
      </div>
      <div className="font-mono text-[10px] text-[#aaa] mt-1 tracking-widest">
        EVERY KEY PRESS = A NOISE TO FILTER
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// NAV
// ─────────────────────────────────────────────────────────────────────────────
function Nav() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 16)
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 bg-cream border-b-[3px] border-ink transition-shadow"
      style={{ boxShadow: scrolled ? '0 5px 0 #111' : 'none' }}
    >
      <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-yellow font-mono font-black text-[11px] flex items-center justify-center border-2 border-ink rounded-sm shadow-[2px_2px_0_#111]">
            YD
          </div>
          <span className="font-black text-[17px] tracking-tight leading-none">
            YT De<span className="bg-yellow px-1 border border-ink">CLICKER</span>
          </span>
        </div>

        {/* Links */}
        <div className="hidden sm:flex items-center gap-5">
          <a href="#engines"  className="font-mono font-bold text-[13px] tracking-wide hover:underline underline-offset-2">ENGINES</a>
          <a href="#features" className="font-mono font-bold text-[13px] tracking-wide hover:underline underline-offset-2">FEATURES</a>
          <a href="/roadmap"   className="font-mono font-bold text-[13px] tracking-wide hover:underline underline-offset-2">ROADMAP</a>
          <a href="/changelog" className="font-mono font-bold text-[13px] tracking-wide hover:underline underline-offset-2">CHANGELOG</a>
          <a href="/docs"      className="font-mono font-bold text-[13px] tracking-wide hover:underline underline-offset-2">DOCS</a>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="neo-btn bg-cream text-ink px-3 py-2 text-[13px] gap-2"
            aria-label="View on GitHub"
          >
            <GitHubIcon size={18} />
            <span className="font-mono font-bold tracking-wide">GITHUB</span>
          </a>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="neo-btn bg-ink text-yellow px-5 py-2 text-[13px] tracking-wide"
          >
            INSTALL FREE →
          </a>
        </div>
      </div>
    </nav>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// WAVEFORM
// ─────────────────────────────────────────────────────────────────────────────
function Waveform({ type, barH = 80 }: { type: 'noisy' | 'clean'; barH?: number }) {
  const bars  = type === 'noisy' ? NOISY_BARS : CLEAN_BARS
  const color = type === 'noisy' ? '#FF3B30'  : '#30D158'
  const anim  = type === 'noisy' ? 'barNoise'  : 'barClean'

  return (
    <div className="flex items-end gap-[3px]" style={{ height: barH }}>
      {bars.map((h, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: `${h}%`,
            backgroundColor: color,
            borderRadius: '2px 2px 0 0',
            transformOrigin: 'bottom',
            animation: `${anim} ${type === 'noisy'
              ? 0.32 + (i % 7) * 0.06
              : 0.7  + (i % 9) * 0.07}s ease-in-out infinite alternate`,
            animationDelay: `${i * 0.022}s`,
          }}
        />
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// HERO
// ─────────────────────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section className="grid-bg relative min-h-screen flex flex-col items-center justify-center pt-24 pb-16 px-5 overflow-hidden">
      {/* Floating keyboard keys */}
      {FLOATING_KEYS.map((k, i) => (
        <div
          key={i}
          className="floating-key"
          style={{
            left: k.x,
            top: k.y,
            '--rot': k.rot,
            '--dur': k.dur,
            '--delay': k.delay,
          } as React.CSSProperties}
        >
          {k.char}
        </div>
      ))}

      <div className="relative z-10 max-w-[980px] w-full mx-auto text-center">
        {/* Pre-badge */}
        <div className="flex items-center justify-center gap-3 mb-7">
          <span className="ticker-tag">⚡ CHROME EXTENSION</span>
          <span
            className="font-mono font-black text-[11px] tracking-[2px] px-3 py-1 border-2 border-ink bg-eq text-ink"
            style={{ boxShadow: '2px 2px 0 #111' }}
          >
            FREE FOREVER
          </span>
        </div>

        {/* Main headline */}
        <h1
          className="font-black leading-[0.88] tracking-[-4px] mb-0"
          style={{ fontSize: 'clamp(56px, 11vw, 118px)' }}
        >
          <div>SILENCE</div>
          <div className="mt-2" style={{ overflow: 'hidden' }}>
            <span
              className="inline-block bg-yellow border-[3px] border-ink px-3 glitch-text"
              data-text="THE CLACK"
              style={{ boxShadow: '7px 7px 0 #111' }}
            >
              THE <DynamicWord />
            </span>
          </div>
        </h1>

        <p className="mt-8 mb-8 text-[#444] max-w-[540px] mx-auto leading-relaxed font-medium"
          style={{ fontSize: 'clamp(15px, 1.8vw, 19px)' }}
        >
          YT DeClicker removes keyboard clicks from YouTube in real-time —
          straight in your browser. Three engines, zero latency compromise.
          Your ears deserve better.
        </p>

        {/* Keyboard visual */}
        <div className="mb-10 flex justify-center">
          <div className="neo-card p-6 bg-[#FFF9E0] inline-block">
            <div className="font-mono font-black text-[10px] tracking-[2px] text-[#888] mb-4 text-center">
              WATCH THE KEYS — RED = NOISE DETECTED → GREEN = FILTERED
            </div>
            <KeyboardVisual />
          </div>
        </div>

        {/* CTAs */}
        <div className="flex flex-wrap gap-4 justify-center mb-14">
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="neo-btn bg-ink text-cream px-8 py-4 text-[15px] tracking-wide">
            ⬇ INSTALL FREE
          </a>
          <a href="#engines" className="neo-btn bg-cream text-ink px-8 py-4 text-[15px] tracking-wide">
            SEE HOW IT WORKS →
          </a>
        </div>

        {/* Before / After waveform */}
        <div className="grid grid-cols-[1fr_40px_1fr] gap-4 items-center max-w-[780px] mx-auto">
          <div className="neo-card p-5 bg-[#FFF5F5]">
            <div className="font-mono font-black text-[10px] tracking-[2px] text-[#FF3B30] mb-3">BEFORE</div>
            <Waveform type="noisy" barH={72} />
            <div className="font-mono text-[10px] text-[#aaa] mt-2.5">click • clack • tap • thud</div>
          </div>

          <div className="text-center font-black text-3xl select-none">→</div>

          <div className="neo-card p-5 bg-[#F0FFF4]">
            <div className="font-mono font-black text-[10px] tracking-[2px] text-eq mb-3">AFTER</div>
            <Waveform type="clean" barH={72} />
            <div className="font-mono text-[10px] text-[#aaa] mt-2.5">pure • crisp • voice</div>
          </div>
        </div>
      </div>

      {/* Scroll cue */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 font-mono text-[11px] text-[#aaa] flex flex-col items-center gap-1 animate-bounce">
        <span>SCROLL</span>
        <span>↓</span>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MARQUEE
// ─────────────────────────────────────────────────────────────────────────────
function Marquee() {
  const txt =
    'KEYBOARD CLICKS • MECHANICAL NOISE • TYPING SOUNDS • KEY CLATTER • CLICK SUPPRESSION • REAL-TIME AI • YOUTUBE AUDIO • '
  const block = txt.repeat(4)

  return (
    <div className="bg-ink border-y-[3px] border-ink py-3.5 overflow-hidden select-none">
      <div
        className="marquee-track flex whitespace-nowrap font-mono font-black text-yellow text-sm tracking-[1px]"
      >
        <span>{block}</span>
        <span>{block}</span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// STATS STRIP
// ─────────────────────────────────────────────────────────────────────────────
function StatsStrip() {
  const { ref, visible } = useReveal()

  const stats = [
    { value: '~0ms', label: 'EQ LATENCY' },
    { value: '3',    label: 'FILTER ENGINES' },
    { value: '48K',  label: 'Hz SAMPLE RATE' },
    { value: '100%', label: 'LOCAL PROCESSING' },
  ]

  return (
    <section ref={ref} className="border-b-[3px] border-ink bg-yellow">
      <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4">
        {stats.map((s, i) => (
          <div
            key={s.label}
            className={`reveal ${visible ? 'visible' : ''} p-8 text-center border-r-[3px] last:border-r-0 border-ink`}
            style={{ transitionDelay: `${i * 100}ms` }}
          >
            <div className="stat-num">{s.value}</div>
            <div className="font-mono font-bold text-[11px] tracking-[2px] text-[#555] mt-2">{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// HOW IT WORKS
// ─────────────────────────────────────────────────────────────────────────────
function HowItWorks() {
  const { ref, visible } = useReveal()

  const steps = [
    {
      num: '01',
      icon: '▶',
      title: 'VIDEO PLAYS',
      body:
        'YouTube loads your video. The raw audio stream passes through your browser before reaching your speakers — just like always.',
      bg: 'bg-cream',
    },
    {
      num: '02',
      icon: '🎛',
      title: 'AUDIO INTERCEPTED',
      body:
        'DeClicker hooks into the Web Audio API and silently inserts a real-time filter chain between YouTube and your audio output.',
      bg: 'bg-[#FFF9E0]',
    },
    {
      num: '03',
      icon: '✓',
      title: 'CLICKS KILLED',
      body:
        'Your chosen engine — EQ, neural net, or deep AI — surgically strips click frequencies while leaving speech crystal clear.',
      bg: 'bg-[#F0FFF4]',
    },
  ]

  return (
    <section className="py-24 px-5" ref={ref}>
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <div className="ticker-tag mx-auto mb-4 w-fit">THE MAGIC</div>
          <h2 className="font-black tracking-[-3px] leading-none"
            style={{ fontSize: 'clamp(38px, 6vw, 68px)' }}
          >
            HOW IT WORKS
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {steps.map((step, i) => (
            <div
              key={step.num}
              className={`neo-card ${step.bg} p-8 reveal ${visible ? 'visible' : ''}`}
              style={{ transitionDelay: `${i * 140}ms` }}
            >
              <div
                className="font-mono font-black leading-none mb-5 select-none"
                style={{ fontSize: '80px', color: 'rgba(17,17,17,0.07)' }}
              >
                {step.num}
              </div>
              <div className="text-5xl mb-4" aria-hidden="true">{step.icon}</div>
              <h3 className="font-mono font-black text-[17px] tracking-[1px] mb-3">{step.title}</h3>
              <p className="text-[#444] leading-relaxed text-[14px]">{step.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ENGINES
// ─────────────────────────────────────────────────────────────────────────────
function Engines() {
  const { ref, visible } = useReveal()

  const engines = [
    {
      id: 'eq',
      name: 'EQ LITE',
      badge: 'INSTANT ON',
      accentColor: '#30D158',
      bg: '#F0FFF4',
      emoji: '🎚',
      tagline: 'Set it. Forget it.',
      bestFor: 'Casual viewers who just want it to work',
      bars: [
        { label: '⚡ Reaction Speed',   value: 100, lo: 'Slow', hi: 'Instant',  caption: 'Instant'     },
        { label: '🎯 Noise Removal',    value: 68,  lo: 'Light', hi: 'Max',     caption: 'Solid'       },
        { label: '🔋 Battery Friendly', value: 96,  lo: 'Heavy', hi: 'Tiny',    caption: 'Barely any'  },
        { label: '📦 Setup Effort',     value: 100, lo: 'Hard',  hi: 'None',    caption: 'Zero!'       },
      ],
    },
    {
      id: 'rnn',
      name: 'RNNOISE',
      badge: 'SMART BRAIN',
      accentColor: '#64D2FF',
      bg: '#F0FAFF',
      emoji: '🧠',
      tagline: 'Tiny brain. Big results.',
      bestFor: 'Users who want smarter filtering, zero wait',
      bars: [
        { label: '⚡ Reaction Speed',   value: 88,  lo: 'Slow', hi: 'Instant',  caption: 'Very fast'   },
        { label: '🎯 Noise Removal',    value: 84,  lo: 'Light', hi: 'Max',     caption: 'Great'       },
        { label: '🔋 Battery Friendly', value: 74,  lo: 'Heavy', hi: 'Tiny',    caption: 'Light'       },
        { label: '📦 Setup Effort',     value: 95,  lo: 'Hard',  hi: 'None',    caption: 'Already in!' },
      ],
    },
    {
      id: 'deep',
      name: 'DEEPFILTER',
      badge: 'BEAST MODE',
      accentColor: '#BF5AF2',
      bg: '#FBF0FF',
      emoji: '🔮',
      tagline: 'Maximum power. No mercy.',
      bestFor: 'Audiophiles who demand absolute perfection',
      bars: [
        { label: '⚡ Reaction Speed',   value: 72,  lo: 'Slow', hi: 'Instant',  caption: 'Quick enough'},
        { label: '🎯 Noise Removal',    value: 100, lo: 'Light', hi: 'Max',     caption: 'ABSOLUTE MAX'},
        { label: '🔋 Battery Friendly', value: 50,  lo: 'Heavy', hi: 'Tiny',    caption: 'Worth it'    },
        { label: '📦 Setup Effort',     value: 65,  lo: 'Hard',  hi: 'None',    caption: '1 download'  },
      ],
    },
  ]

  return (
    <section id="engines" className="bg-ink py-24 px-5" ref={ref}>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="font-mono font-black text-[11px] tracking-[3px] text-[#666] mb-4">THREE WEAPONS</div>
          <h2
            className="font-black leading-none tracking-[-3px] text-white"
            style={{ fontSize: 'clamp(38px, 6vw, 68px)' }}
          >
            PICK YOUR<br />
            <span className="text-yellow">ENGINE</span>
          </h2>
          <p className="text-[#888] font-mono text-[13px] mt-5 tracking-wide">Tap the one that matches your vibe</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {engines.map((e, i) => (
            <div
              key={e.id}
              className={`neo-card-lift reveal ${visible ? 'visible' : ''} relative overflow-hidden flex flex-col`}
              style={{
                background: e.bg,
                border: `3px solid ${e.accentColor}`,
                boxShadow: `7px 7px 0 ${e.accentColor}`,
                transitionDelay: `${i * 130}ms`,
              }}
            >
              {/* Top strip */}
              <div className="px-6 pt-6 pb-5">
                {/* Badge */}
                <div
                  className="inline-block font-mono font-black text-[9px] tracking-[1.5px] px-2.5 py-1 border-2 border-ink mb-4"
                  style={{ background: e.accentColor }}
                >
                  {e.badge}
                </div>

                <div className="flex items-center gap-3 mb-1">
                  <span className="text-3xl">{e.emoji}</span>
                  <h3 className="font-mono font-black text-[22px] tracking-[2px]">{e.name}</h3>
                </div>
                <p className="font-mono font-bold text-[13px] text-[#555] mb-5">{e.tagline}</p>

                {/* Stat bars */}
                <div className="flex flex-col gap-4">
                  {e.bars.map(bar => (
                    <div key={bar.label}>
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="font-mono font-bold text-[11px] tracking-wide">{bar.label}</span>
                        <span
                          className="font-mono font-black text-[10px] tracking-[0.5px] px-1.5 py-0.5"
                          style={{ background: e.accentColor, border: '1.5px solid #111' }}
                        >
                          {bar.caption}
                        </span>
                      </div>
                      {/* Bar track */}
                      <div
                        className="w-full h-4 border-2 border-ink overflow-hidden"
                        style={{ background: 'rgba(0,0,0,0.08)' }}
                      >
                        {/* Bar fill — animates width when visible */}
                        <div
                          style={{
                            height: '100%',
                            width: visible ? `${bar.value}%` : '0%',
                            background: e.accentColor,
                            borderRight: bar.value < 100 ? '2px solid #111' : 'none',
                            transition: `width 0.8s cubic-bezier(0.22,1,0.36,1) ${i * 130 + 200}ms`,
                            position: 'relative',
                          }}
                        >
                          {/* Shine stripe */}
                          <div style={{
                            position: 'absolute', top: 0, left: 0, right: 0,
                            height: '40%', background: 'rgba(255,255,255,0.28)',
                          }} />
                        </div>
                      </div>
                      <div className="flex justify-between mt-0.5">
                        <span className="font-mono text-[9px] text-[#999]">{bar.lo}</span>
                        <span className="font-mono text-[9px] text-[#999]">{bar.hi}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Best-for footer strip */}
              <div
                className="mt-auto px-6 py-3 border-t-2 border-ink font-mono text-[11px] font-bold tracking-wide flex items-center gap-2"
                style={{ background: 'rgba(0,0,0,0.06)' }}
              >
                <span style={{ color: e.accentColor }}>▶</span>
                <span>{e.bestFor}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// FEATURES
// ─────────────────────────────────────────────────────────────────────────────
function Features() {
  const { ref, visible } = useReveal()

  const items = [
    { icon: '🔒', title: '100% PRIVATE',        bg: '#FFF9E0', desc: 'All processing happens inside your browser tab. Your audio never touches any server — ever.'                                },
    { icon: '▶',  title: 'ANY YOUTUBE VIDEO',   bg: '#F0FFF4', desc: 'Auto-hooks into the active video element. No manual setup, no URL restrictions, no exceptions.'                           },
    { icon: '🎚', title: 'TUNABLE INTENSITY',   bg: '#F0FAFF', desc: 'Dial suppression from 0 to 100%. Subtle filtering or full nuclear option — a single slider.'                             },
    { icon: '⚡', title: 'AUTO-RECONNECTS',     bg: '#FBF0FF', desc: 'Survives YouTube\'s client-side navigation. The hook persists across video changes without a page reload.'               },
    { icon: '💾', title: 'SMART CACHING',       bg: '#FFF0F5', desc: 'DeepFilter\'s 2 MB model downloads exactly once and lives in IndexedDB. No repeat downloads on revisit.'                },
    { icon: '🌓', title: 'DARK & LIGHT MODE',   bg: '#F5F0FF', desc: 'The popup UI adapts to your system theme. Looks polished in both light and dark.'                                        },
    { icon: '🎛', title: 'PRESET MODES',        bg: '#FFF5E0', desc: 'EQ engine ships with LIGHT / MED / HEAVY / NUKE presets — tap once to jump to a calibrated setting.'                    },
    { icon: '📦', title: 'SMART DOWNLOADS',     bg: '#F0FFFA', desc: 'Large WASM and model files transfer via a service-worker proxy that bypasses YouTube\'s strict CSP rules seamlessly.'    },
  ]

  return (
    <section id="features" className="py-24 px-5 bg-cream" ref={ref}>
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <div className="ticker-tag mx-auto mb-4 w-fit">WHY YOU&apos;LL LOVE IT</div>
          <h2 className="font-black tracking-[-3px] leading-none"
            style={{ fontSize: 'clamp(38px, 6vw, 68px)' }}
          >
            BUILT RIGHT
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {items.map((item, i) => (
            <div
              key={item.title}
              className={`neo-card neo-card-lift reveal ${visible ? 'visible' : ''} p-6`}
              style={{ background: item.bg, transitionDelay: `${i * 70}ms` }}
            >
              <div className="text-4xl mb-4" aria-hidden="true">{item.icon}</div>
              <h3 className="font-mono font-black text-[12px] tracking-[1px] mb-2">{item.title}</h3>
              <p className="text-[#555] text-[13px] leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PRIVACY CALLOUT
// ─────────────────────────────────────────────────────────────────────────────
function PrivacyCallout() {
  const { ref, visible } = useReveal()

  return (
    <section className="py-16 px-5 bg-ink border-y-[3px] border-ink" ref={ref}>
      <div
        className={`max-w-5xl mx-auto neo-card bg-yellow p-10 md:p-14 text-center reveal ${visible ? 'visible' : ''}`}
        style={{ boxShadow: '10px 10px 0 #FFE500' }}
      >
        <div className="text-5xl mb-5">🔒</div>
        <h2 className="font-black tracking-[-2px] mb-4" style={{ fontSize: 'clamp(28px, 5vw, 52px)' }}>
          YOUR AUDIO NEVER LEAVES<br />YOUR BROWSER.
        </h2>
        <p className="text-[#444] text-[16px] max-w-[580px] mx-auto leading-relaxed">
          No cloud processing. No microphone access. No telemetry. The extension
          intercepts the existing audio stream inside your tab — nothing is
          recorded, transmitted, or stored anywhere outside your own device.
        </p>
        <div className="flex flex-wrap gap-4 justify-center mt-8">
          {['NO SERVERS', 'NO ACCOUNT', 'NO MICROPHONE', 'NO TRACKING'].map(badge => (
            <div
              key={badge}
              className="font-mono font-black text-[11px] tracking-[2px] border-2 border-ink px-4 py-2 bg-ink text-yellow"
              style={{ boxShadow: '3px 3px 0 #111' }}
            >
              ✓ {badge}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// INSTALL CTA
// ─────────────────────────────────────────────────────────────────────────────
function InstallCTA() {
  const { ref, visible } = useReveal()

  return (
    <section
      id="install"
      className="py-28 px-5 bg-yellow border-t-[3px] border-b-[3px] border-ink text-center"
      ref={ref}
    >
      <div className={`max-w-[700px] mx-auto reveal ${visible ? 'visible' : ''}`}>
        <div className="font-mono font-bold text-[11px] tracking-[3px] text-[#666] mb-5">
          YOU&apos;VE SUFFERED LONG ENOUGH
        </div>
        <h2
          className="font-black leading-[0.88] tracking-[-4px] mb-7"
          style={{ fontSize: 'clamp(44px, 9vw, 88px)' }}
        >
          READY TO<br />SILENCE<br />THE CLACK?
        </h2>
        <p className="text-[#555] text-[17px] mb-12 leading-relaxed">
          Free. Open source. No account. No telemetry. Works in thirty seconds.
        </p>

        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="neo-btn bg-ink text-cream px-12 py-5 text-[17px] tracking-wide"
          style={{ boxShadow: '9px 9px 0 rgba(0,0,0,0.25)' }}
        >
          ⬇ INSTALL ON CHROME
        </a>

        <div className="flex flex-wrap gap-6 justify-center mt-10">
          {['FREE FOREVER', 'NO ACCOUNT', 'OPEN SOURCE', 'ZERO TELEMETRY'].map(b => (
            <div key={b} className="font-mono font-bold text-[11px] tracking-[1px] text-[#555]">
              ✓ {b}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE REQUEST
// ─────────────────────────────────────────────────────────────────────────────
function FeatureRequest() {
  const { ref, visible } = useReveal()
  const [selected, setSelected] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const handleSubmit = () => {
    if (!selected) return
    const noise = NOISE_TYPES.find(n => n.id === selected)
    const subject = encodeURIComponent(`YT DeClicker Feature Request: Filter "${noise?.label}"`)
    const body = encodeURIComponent(
      `Hi,\n\nI'd love YT DeClicker to also filter: ${noise?.emoji} ${noise?.label}\n\nSent from ytdeclicker.com`
    )
    window.open(`mailto:harshkumar09104@gmail.com?subject=${subject}&body=${body}`)
    setSent(true)
    setTimeout(() => setSent(false), 4000)
  }

  return (
    <section id="feature-request" className="py-24 px-5 bg-ink" ref={ref}>
      <div className="max-w-3xl mx-auto">
        <div className={`reveal ${visible ? 'visible' : ''}`}>
          <div className="text-center mb-12">
            <div className="font-mono font-black text-[11px] tracking-[3px] text-[#666] mb-4">
              WHAT&apos;S NEXT?
            </div>
            <h2
              className="font-black leading-none tracking-[-3px] text-white mb-4"
              style={{ fontSize: 'clamp(36px, 6vw, 64px)' }}
            >
              SILENCE SOMETHING<br />
              <span className="text-yellow">ELSE?</span>
            </h2>
            <p className="text-[#888] text-[15px] max-w-md mx-auto leading-relaxed">
              Pick the noise that&apos;s ruining your YouTube experience.
              One tap — we&apos;ll hear you.
            </p>
          </div>

          {/* Noise type grid */}
          <div className="grid grid-cols-3 sm:grid-cols-3 gap-3 mb-8">
            {NOISE_TYPES.map(n => (
              <button
                key={n.id}
                onClick={() => setSelected(s => s === n.id ? null : n.id)}
                className="border-[3px] border-[#333] p-4 text-left transition-all duration-100 cursor-pointer"
                style={{
                  background:  selected === n.id ? '#FFE500' : '#1a1a1a',
                  color:       selected === n.id ? '#111'    : '#ccc',
                  borderColor: selected === n.id ? '#FFE500' : '#333',
                  boxShadow:   selected === n.id ? '4px 4px 0 #FFE500' : '4px 4px 0 #333',
                  transform:   selected === n.id ? 'translate(-2px,-2px)' : 'none',
                }}
              >
                <div className="text-2xl mb-2">{n.emoji}</div>
                <div className="font-mono font-black text-[11px] tracking-[1px]">{n.label.toUpperCase()}</div>
              </button>
            ))}
          </div>

          {/* Submit */}
          <div className="flex justify-center">
            <button
              onClick={handleSubmit}
              disabled={!selected}
              className="neo-btn px-10 py-4 text-[14px] tracking-wide font-mono font-black"
              style={{
                background:  selected ? '#FFE500' : '#333',
                color:       selected ? '#111'    : '#555',
                borderColor: selected ? '#111'    : '#444',
                boxShadow:   selected ? '5px 5px 0 #111' : '5px 5px 0 #444',
                cursor:      selected ? 'pointer' : 'not-allowed',
                opacity:     selected ? 1 : 0.6,
                transition:  'all 0.1s ease',
              }}
            >
              {sent ? '✓ REQUEST SENT — THANKS!' : '→ REQUEST THIS FEATURE'}
            </button>
          </div>

          <p className="text-center font-mono text-[11px] text-[#555] mt-5">
            Opens your email client pre-filled and ready to send.
          </p>
        </div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// FOOTER
// ─────────────────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="bg-ink border-t-[3px] border-ink py-10 px-5">
      <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-yellow border-2 border-[#333] rounded-sm flex items-center justify-center font-mono font-black text-[10px] text-ink shadow-[2px_2px_0_#444]">
            YD
          </div>
          <span className="text-white font-bold text-[15px]">YT DeClicker v3</span>
          <span className="text-[#555] font-mono text-[11px] hidden sm:block">
            • Real-time noise suppression
          </span>
        </div>

        <div className="flex items-center gap-4">
          <a href="/docs" className="font-mono text-[11px] font-bold tracking-wide text-[#888] hover:text-yellow transition-colors">
            DOCS
          </a>
          <a href="/roadmap" className="font-mono text-[11px] font-bold tracking-wide text-[#888] hover:text-yellow transition-colors">
            ROADMAP
          </a>
          <a href="/changelog" className="font-mono text-[11px] font-bold tracking-wide text-[#888] hover:text-yellow transition-colors">
            CHANGELOG
          </a>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-[#888] hover:text-yellow transition-colors"
            aria-label="View source on GitHub"
          >
            <GitHubIcon size={16} />
            <span className="font-mono text-[11px] font-bold tracking-wide">SOURCE</span>
          </a>
          <div className="font-mono text-[11px] text-[#555]">
            MIT License • Powered by EQ + RNNoise + DeepFilterNet3
          </div>
        </div>
      </div>
    </footer>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────────────────────
const JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'YT DeClicker',
  applicationCategory: 'BrowserApplication',
  operatingSystem: 'Chrome',
  description:
    'Free Chrome extension that removes keyboard clicks and typing noise from YouTube videos in real-time using EQ filters, RNNoise ML, or DeepFilterNet3 AI.',
  url: 'https://ytdeclicker.com',
  downloadUrl: 'https://github.com/harsh2929/yt-declicker',
  softwareVersion: '3',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  author: { '@type': 'Person', name: 'Harsh Bishnoi', url: 'https://github.com/harsh2929' },
  featureList: [
    'Real-time keyboard click removal',
    'Three AI engines: EQ Lite, RNNoise, DeepFilterNet3',
    'Works on any YouTube video',
    'No audio sent to any server — fully local processing',
  ],
}

// JSON_LD is a static constant with no user input — dangerouslySetInnerHTML is safe here
// and is the standard Next.js-recommended pattern for JSON-LD structured data.
export default function Home() {
  return (
    <>
      {/* eslint-disable-next-line react/no-danger */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
      <main className="overflow-x-hidden">
      <Nav />
      <Hero />
      <Marquee />
      <StatsStrip />
      <HowItWorks />
      <Engines />
      <Features />
      <PrivacyCallout />
      <InstallCTA />
      <FeatureRequest />
      <Footer />
    </main>
    </>
  )
}
