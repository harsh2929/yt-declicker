'use client'

import React, { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

const GITHUB_URL = 'https://github.com/harsh2929/yt-declicker'

function GitHubIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  )
}

function useReveal() {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect() } },
      { threshold: 0.1 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return { ref, visible }
}

const STATUS_STYLES: Record<string, { bg: string; border: string; text: string; label: string }> = {
  shipped:     { bg: '#F0FFF4', border: '#30D158', text: '#1a6630', label: '✓ SHIPPED'      },
  progress:    { bg: '#FFF9E0', border: '#FFE500', text: '#7a6800', label: '⚡ IN PROGRESS'  },
  planned:     { bg: '#F0FAFF', border: '#64D2FF', text: '#1a5a7a', label: '◎ PLANNED'       },
  future:      { bg: '#FBF0FF', border: '#BF5AF2', text: '#6a2090', label: '◌ FUTURE'        },
}

const ROADMAP_ITEMS = [
  // ── SHIPPED ──────────────────────────────────────────────────────────────
  {
    status: 'shipped',
    version: 'v1.0',
    title: 'EQ Engine',
    desc: 'Multi-band parametric EQ targeting 1–6 kHz keyboard click frequencies. Zero download, near-zero latency. The original DeClicker.',
    tags: ['Keyboard clicks', 'EQ + Compressor', '~0ms latency'],
  },
  {
    status: 'shipped',
    version: 'v2.0',
    title: 'RNNoise ML Engine',
    desc: "Mozilla's RNNoise neural network bundled inside the extension. Broader noise suppression beyond keyboard clicks — fan hum, background hiss.",
    tags: ['ML-based', '150KB bundled', 'Fan noise'],
  },
  {
    status: 'shipped',
    version: 'v3.0',
    title: 'DeepFilterNet3 AI Engine',
    desc: 'State-of-the-art deep learning model (~2MB, cached locally). Full-band filtering with audiophile-grade quality.',
    tags: ['Deep AI', 'Cached locally', 'Best quality'],
  },
  // ── IN PROGRESS ──────────────────────────────────────────────────────────
  {
    status: 'progress',
    version: 'v3.1',
    title: 'Mouse Click Suppression',
    desc: 'Targeted filtering for mouse click transients — different frequency profile from keyboard clicks but equally distracting in gaming/tutorial videos.',
    tags: ['Mouse clicks', 'Transient detection', 'Gaming videos'],
  },
  {
    status: 'progress',
    version: 'v3.1',
    title: 'Per-Video Intensity Memory',
    desc: "Remember your intensity setting per YouTube channel or video. Set HEAVY for a loud typer and LIGHT for someone with a quiet keyboard — it sticks.",
    tags: ['UX improvement', 'Per-channel settings'],
  },
  // ── PLANNED ──────────────────────────────────────────────────────────────
  {
    status: 'planned',
    version: 'v4.0',
    title: 'Fan & AC Noise Filter',
    desc: 'Dedicated model for steady-state background noise — CPU fans, air conditioning, room hum. Spectral subtraction approach for minimal voice artifacts.',
    tags: ['Fan noise', 'AC/HVAC', 'Steady-state noise'],
  },
  {
    status: 'planned',
    version: 'v4.0',
    title: 'Crowd & Room Noise',
    desc: 'Filter out crowd chatter, conference room echo, co-working space noise. Targeted at in-person conference talks, meetup recordings, and vlogs.',
    tags: ['Crowd noise', 'Echo', 'Conference videos'],
  },
  {
    status: 'planned',
    version: 'v4.1',
    title: 'Adjustable Noise Profiles',
    desc: 'Save and share custom filter presets. Build a profile for a specific creator whose setup has a distinct noise signature.',
    tags: ['Custom profiles', 'Community presets', 'Per-creator'],
  },
  // ── FUTURE ───────────────────────────────────────────────────────────────
  {
    status: 'future',
    version: 'v5.0',
    title: 'Background Music Separation',
    desc: 'Separate and optionally attenuate background music from the speaker\'s voice — great for cooking/vlog content where music competes with speech.',
    tags: ['Music vs. voice', 'Source separation', 'Advanced AI'],
  },
  {
    status: 'future',
    version: 'v5.0',
    title: 'Echo & Reverb Removal',
    desc: 'De-reverb to handle bathroom/bedroom recording setups. Some creators record in untreated spaces — this would make them sound like they\'re in a studio.',
    tags: ['De-reverb', 'Room acoustics', 'Advanced DSP'],
  },
  {
    status: 'future',
    version: 'v5.1',
    title: 'Smart Noise Auto-Profile',
    desc: 'Auto-detect the noise type from the first few seconds of a video and automatically select + tune the best engine. Zero configuration.',
    tags: ['Auto-detect', 'AI classification', 'Zero-config'],
  },
  {
    status: 'future',
    version: 'v5.2',
    title: 'Multi-Platform Support',
    desc: 'Expand beyond YouTube — Twitch, Vimeo, Twitter/X videos, and any HTML5 video element on any page.',
    tags: ['Twitch', 'All platforms', 'Universal'],
  },
]

export default function Roadmap() {
  const heroRef = useRef<HTMLDivElement>(null)

  const grouped = {
    shipped:  ROADMAP_ITEMS.filter(i => i.status === 'shipped'),
    progress: ROADMAP_ITEMS.filter(i => i.status === 'progress'),
    planned:  ROADMAP_ITEMS.filter(i => i.status === 'planned'),
    future:   ROADMAP_ITEMS.filter(i => i.status === 'future'),
  }

  return (
    <main className="overflow-x-hidden bg-[#FAF6EC]">
      {/* ── NAV ──────────────────────────────────────────────────────────── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#FAF6EC] border-b-[3px] border-[#111]">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 no-underline">
            <div className="w-9 h-9 bg-[#FFE500] font-mono font-black text-[11px] flex items-center justify-center border-2 border-[#111] rounded-sm" style={{ boxShadow: '2px 2px 0 #111' }}>
              YD
            </div>
            <span className="font-black text-[17px] tracking-tight">
              YT De<span className="bg-[#FFE500] px-1 border border-[#111]">CLICKER</span>
            </span>
          </Link>

          <div className="hidden sm:flex items-center gap-5">
            <Link href="/#engines"  className="font-mono font-bold text-[13px] tracking-wide hover:underline underline-offset-2 text-[#111]">ENGINES</Link>
            <Link href="/#features" className="font-mono font-bold text-[13px] tracking-wide hover:underline underline-offset-2 text-[#111]">FEATURES</Link>
            <span className="font-mono font-black text-[13px] tracking-wide border-b-2 border-[#111]">ROADMAP</span>
            <a
              href={GITHUB_URL} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 border-[3px] border-[#111] px-3 py-2 text-[13px] font-mono font-bold"
              style={{ boxShadow: '4px 4px 0 #111' }}
            >
              <GitHubIcon size={16} /> GITHUB
            </a>
          </div>
        </div>
      </nav>

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section
        ref={heroRef}
        className="pt-36 pb-20 px-5 text-center"
        style={{
          backgroundImage: 'linear-gradient(rgba(17,17,17,0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(17,17,17,0.055) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
        }}
      >
        <div className="max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-[#111] text-[#FFE500] font-mono font-black text-[11px] tracking-[2px] px-3 py-1.5 mb-6 rounded-sm">
            🗺 ROADMAP
          </div>
          <h1
            className="font-black tracking-[-4px] leading-[0.88] mb-6"
            style={{ fontSize: 'clamp(52px, 10vw, 100px)' }}
          >
            WHERE WE&apos;RE<br />
            <span
              className="inline-block bg-[#FFE500] border-[3px] border-[#111] px-3"
              style={{ boxShadow: '7px 7px 0 #111' }}
            >
              HEADED
            </span>
          </h1>
          <p className="text-[#555] text-[17px] max-w-xl mx-auto leading-relaxed">
            Keyboard clicks are just the beginning. We&apos;re building a complete
            YouTube noise elimination suite — one engine at a time.
          </p>
        </div>
      </section>

      {/* ── PROGRESS BAR ─────────────────────────────────────────────────── */}
      <div className="border-y-[3px] border-[#111] bg-[#111] px-5 py-4">
        <div className="max-w-6xl mx-auto flex flex-wrap gap-6 justify-center sm:justify-between items-center">
          {Object.entries(STATUS_STYLES).map(([key, s]) => (
            <div key={key} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full border-2 border-[#111]" style={{ background: s.border }} />
              <span className="font-mono font-bold text-[11px] tracking-[1px]" style={{ color: s.border }}>
                {s.label} ({ROADMAP_ITEMS.filter(i => i.status === key).length})
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── ROADMAP SECTIONS ─────────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-5 py-20">
        {(Object.entries(grouped) as [keyof typeof grouped, typeof ROADMAP_ITEMS][]).map(([status, items]) => (
          <RoadmapGroup key={status} status={status} items={items} />
        ))}
      </div>

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <section className="bg-[#111] border-t-[3px] border-[#111] py-20 px-5 text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="font-black text-white tracking-[-2px] leading-tight mb-4"
            style={{ fontSize: 'clamp(32px, 5vw, 56px)' }}>
            GOT A NOISE<br />TO SILENCE?
          </h2>
          <p className="text-[#888] mb-8 text-[15px] leading-relaxed">
            Vote for a feature, open an issue, or submit a PR.
            This is open source — your voice shapes the roadmap.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <a
              href={`${GITHUB_URL}/issues/new`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 border-[3px] border-[#FFE500] px-8 py-4 text-[14px] font-mono font-black text-[#FFE500]"
              style={{ boxShadow: '5px 5px 0 #FFE500' }}
            >
              <GitHubIcon size={18} /> OPEN AN ISSUE
            </a>
            <Link
              href="/#feature-request"
              className="border-[3px] border-[#333] px-8 py-4 text-[14px] font-mono font-black text-[#888] no-underline"
              style={{ boxShadow: '5px 5px 0 #333' }}
            >
              ↓ QUICK VOTE ON HOMEPAGE
            </Link>
          </div>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────────────── */}
      <footer className="bg-[#0a0a0a] border-t-[3px] border-[#111] py-8 px-5">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <Link href="/" className="font-mono text-[12px] text-[#555] hover:text-[#888] no-underline">
            ← Back to homepage
          </Link>
          <div className="font-mono text-[11px] text-[#444]">
            MIT License • YT DeClicker
          </div>
        </div>
      </footer>
    </main>
  )
}

// ── Roadmap group (section per status) ────────────────────────────────────────
function RoadmapGroup({
  status,
  items,
}: {
  status: string
  items: typeof ROADMAP_ITEMS
}) {
  const { ref, visible } = useReveal()
  const s = STATUS_STYLES[status]

  return (
    <div ref={ref} className="mb-16">
      {/* Status heading */}
      <div className="flex items-center gap-4 mb-8">
        <div
          className="font-mono font-black text-[13px] tracking-[2px] px-4 py-2 border-[3px] border-[#111]"
          style={{ background: s.border, color: '#111', boxShadow: '4px 4px 0 #111' }}
        >
          {s.label}
        </div>
        <div className="flex-1 h-[3px] bg-[#111] opacity-10" />
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {items.map((item, i) => (
          <div
            key={item.title}
            className="reveal neo-card"
            style={{
              background: s.bg,
              borderColor: s.border,
              boxShadow: `5px 5px 0 ${s.border}`,
              padding: '24px',
              transitionDelay: `${i * 100}ms`,
              opacity: visible ? 1 : 0,
              transform: visible ? 'translateY(0)' : 'translateY(30px)',
              transition: 'opacity 0.6s ease, transform 0.6s ease',
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <span
                className="font-mono font-black text-[10px] tracking-[1px] px-2 py-1 border-2 border-[#111]"
                style={{ background: s.border, color: '#111' }}
              >
                {item.version}
              </span>
              <span className="font-mono text-[10px] tracking-[1px]" style={{ color: s.text }}>
                {s.label}
              </span>
            </div>

            <h3 className="font-black text-[18px] tracking-[-0.5px] mb-2">{item.title}</h3>
            <p className="text-[#555] text-[13px] leading-relaxed mb-4">{item.desc}</p>

            <div className="flex flex-wrap gap-1.5">
              {item.tags.map(tag => (
                <span
                  key={tag}
                  className="font-mono text-[10px] px-2 py-0.5 border border-[#111] bg-white/60"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
