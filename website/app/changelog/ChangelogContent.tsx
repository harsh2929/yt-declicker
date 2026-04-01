'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

const GITHUB_URL = 'https://github.com/harsh2929/yt-declicker'

function GitHubIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  )
}

// ─── CHANGELOG DATA ───────────────────────────────────────────────────────────
// Add new releases to the TOP of this array.
type ChangeType = 'new' | 'improved' | 'fixed' | 'removed' | 'security'

interface Change {
  type: ChangeType
  text: string
}

interface Release {
  version: string
  date: string
  tag?: 'LATEST' | 'MAJOR'
  summary: string
  changes: Change[]
}

const RELEASES: Release[] = [
  {
    version: '3.1.0',
    date: '2026-04-01',
    tag: 'LATEST',
    summary: 'Popup now works fully off YouTube — download models, switch engines, and adjust intensity from any tab. Plus an in-popup update notifier.',
    changes: [
      { type: 'new',      text: 'All popup features (engine selection, intensity, power, model download/delete) now work on any browser tab — no YouTube tab required.' },
      { type: 'new',      text: 'Model download routes directly through the background service worker. Settings are stored in chrome.storage.local and synced to the content script on next YouTube load.' },
      { type: 'new',      text: 'In-popup update banner — checks GitHub releases on startup and shows a dismissible "v3.x.x available" notice when a newer version is found.' },
      { type: 'new',      text: 'Status badge distinguishes OFFLINE (not on YouTube, expected) from NO SCRIPT (on YouTube but script not loaded).' },
      { type: 'improved', text: 'DeepFilterNet3 assets staged in chrome.storage.local are imported into IndexedDB automatically on next YouTube load — no re-download needed.' },
      { type: 'improved', text: 'After model download, progress bar shows "Model loaded!" then smoothly fades out after 5 seconds.' },
      { type: 'fixed',    text: 'Engine cards and intensity slider now retain their values when the popup is opened off YouTube.' },
    ],
  },
  {
    version: '3.0.0',
    date: '2026-03-25',
    tag: 'MAJOR',
    summary: 'Complete rewrite with three AI engines, gamified engine cards with animated stat bars, a technical docs site, and a roadmap page.',
    changes: [
      { type: 'new',      text: 'EQ Lite engine — multi-band notch filters targeting 1–6 kHz click frequencies with a dynamics compressor. Zero download, instant.' },
      { type: 'new',      text: 'RNNoise engine — Mozilla\'s 150 KB recurrent neural network bundled in the extension. Catches fan hum, room noise, and typing sounds.' },
      { type: 'new',      text: 'DeepFilterNet3 engine — state-of-the-art deep-learning noise suppressor (~2 MB one-time download). Maximum possible clarity.' },
      { type: 'new',      text: 'Animated progress bars per engine card with plain-English labels (Reaction Speed, Noise Removal, Battery Friendly, Setup Effort).' },
      { type: 'new',      text: 'Vertical stacked engine card layout — full-width bars with grid labels, replacing the cramped 3-column layout.' },
      { type: 'new',      text: 'Bug report button in footer — opens a pre-filled mailto with engine, intensity, and browser info.' },
      { type: 'new',      text: 'Dark/light theme toggle in popup.' },
      { type: 'new',      text: 'Website: technical docs page (/docs) with sticky TOC and 9 deep-dive sections.' },
      { type: 'new',      text: 'Website: roadmap page (/roadmap) with shipped/in-progress/planned/future grouping.' },
      { type: 'new',      text: 'Content script injection button — appears when script is missing so users can recover without refreshing.' },
      { type: 'improved', text: 'CSP bypass architecture: background service worker proxies all CDN downloads, stores base64 in chrome.storage.local, content script decodes to IndexedDB.' },
      { type: 'improved', text: 'Asset versioning — cached WASM and model are automatically evicted when CDN models change.' },
      { type: 'improved', text: 'State persisted in both localStorage (YouTube page) and chrome.storage.local (cross-context).' },
    ],
  },
  {
    version: '2.0.0',
    date: '2025-11-10',
    summary: 'Switched to Manifest v3. Added RNNoise ML engine as second option alongside the original EQ filters.',
    changes: [
      { type: 'new',      text: 'Manifest v3 service worker — replaces the MV2 background page.' },
      { type: 'new',      text: 'RNNoise ML engine option added to the popup.' },
      { type: 'new',      text: 'chrome.storage.local for settings — synced across all YouTube tabs.' },
      { type: 'improved', text: 'EQ filter gains now scale linearly with the intensity slider (0–100%).' },
      { type: 'improved', text: 'Compressor threshold adapts with intensity — more aggressive at higher settings.' },
      { type: 'fixed',    text: 'Audio context sometimes stayed suspended after YouTube\'s autoplay policy fired.' },
      { type: 'fixed',    text: 'Source node not released when navigating between YouTube videos.' },
    ],
  },
  {
    version: '1.0.0',
    date: '2025-08-01',
    summary: 'Initial release. EQ-only noise filtering using multi-band notch filters targeting keyboard click frequencies.',
    changes: [
      { type: 'new', text: 'Multi-band EQ targeting 1.4 kHz, 2.2 kHz, 3.5 kHz, 5 kHz, 7 kHz click resonances.' },
      { type: 'new', text: 'Dynamics compressor with 0.5 ms attack to catch click transients.' },
      { type: 'new', text: 'Intensity slider from 0–100%.' },
      { type: 'new', text: 'Power toggle with on/off state persisted in localStorage.' },
      { type: 'new', text: 'Auto-hooks into the YouTube video element via MutationObserver.' },
      { type: 'new', text: 'Reconnects after YouTube\'s client-side navigation.' },
    ],
  },
]

// ─── CHANGE TYPE CONFIG ───────────────────────────────────────────────────────
const TYPE_CONFIG: Record<ChangeType, { label: string; bg: string; fg: string; dot: string }> = {
  new:      { label: 'NEW',      bg: '#F0FFF4', fg: '#064e23', dot: '#4ade80' },
  improved: { label: 'IMPROVED', bg: '#F0F7FF', fg: '#1e3a5f', dot: '#60a5fa' },
  fixed:    { label: 'FIXED',    bg: '#FFF9E0', fg: '#6b4f00', dot: '#FFE500' },
  removed:  { label: 'REMOVED',  bg: '#FFF0F0', fg: '#7f1d1d', dot: '#f87171' },
  security: { label: 'SECURITY', bg: '#F5F0FF', fg: '#3b0764', dot: '#a78bfa' },
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
}

function useReveal() {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect() } },
      { threshold: 0.08 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return { ref, visible }
}

function ReleaseCard({ release, index }: { release: Release; index: number }) {
  const { ref, visible } = useReveal()

  const grouped = release.changes.reduce<Record<ChangeType, Change[]>>(
    (acc, c) => { acc[c.type].push(c); return acc },
    { new: [], improved: [], fixed: [], removed: [], security: [] }
  )

  return (
    <div
      ref={ref}
      className="relative"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(24px)',
        transition: `opacity 0.5s ease ${index * 80}ms, transform 0.5s ease ${index * 80}ms`,
      }}
    >
      {/* Timeline dot */}
      <div
        className="absolute left-[-9px] top-6 w-4 h-4 rounded-full border-[3px] border-[#111] bg-[#FFE500] hidden lg:block"
        style={{ boxShadow: '2px 2px 0 #111' }}
      />

      <div
        className="border-[3px] border-[#111] bg-white mb-10"
        style={{ boxShadow: '6px 6px 0 #111' }}
      >
        {/* Card header */}
        <div className="border-b-[3px] border-[#111] px-6 py-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span className="font-mono font-black text-[28px] tracking-tight">v{release.version}</span>
              {release.tag && (
                <span
                  className="font-mono font-black text-[10px] tracking-[2px] px-2 py-1"
                  style={{
                    background: release.tag === 'LATEST' ? '#4ade80' : '#FFE500',
                    border: '2px solid #111',
                    color: '#111',
                  }}
                >
                  {release.tag}
                </span>
              )}
            </div>
            <time
              dateTime={release.date}
              className="font-mono text-[12px] text-[#888] tracking-wide"
            >
              {formatDate(release.date)}
            </time>
          </div>
          <a
            href={`${GITHUB_URL}/releases/tag/v${release.version}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 font-mono font-bold text-[11px] tracking-wide text-[#111] border-2 border-[#111] px-3 py-1.5 hover:bg-[#FFE500] transition-colors"
            style={{ boxShadow: '2px 2px 0 #111' }}
          >
            <GitHubIcon size={13} />
            RELEASE NOTES ↗
          </a>
        </div>

        {/* Summary */}
        <div className="px-6 pt-4 pb-2">
          <p className="text-[15px] text-[#444] leading-relaxed">{release.summary}</p>
        </div>

        {/* Changes grouped by type */}
        <div className="px-6 pb-6">
          {(Object.entries(grouped) as [ChangeType, Change[]][]).map(([type, items]) => {
            if (items.length === 0) return null
            const cfg = TYPE_CONFIG[type]
            return (
              <div key={type} className="mt-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: cfg.dot }} />
                  <span
                    className="font-mono font-black text-[9px] tracking-[2px] px-2 py-0.5"
                    style={{ background: cfg.bg, color: cfg.fg, border: `1px solid ${cfg.dot}` }}
                  >
                    {cfg.label}
                  </span>
                </div>
                <ul className="space-y-1.5 ml-4">
                  {items.map((change, i) => (
                    <li key={i} className="flex gap-2 text-[14px] text-[#333] leading-relaxed">
                      <span className="text-[#aaa] mt-1 shrink-0">–</span>
                      <span>{change.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── PAGE ─────────────────────────────────────────────────────────────────────
export default function ChangelogContent() {
  return (
    <main className="min-h-screen bg-[#FAF6EC] overflow-x-hidden">

      {/* ── NAV ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#FAF6EC] border-b-[3px] border-[#111]">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 no-underline">
            <div
              className="w-9 h-9 bg-[#FFE500] font-mono font-black text-[11px] flex items-center justify-center border-2 border-[#111] rounded-sm"
              style={{ boxShadow: '2px 2px 0 #111' }}
            >
              YD
            </div>
            <span className="font-black text-[17px] tracking-tight">
              YT De<span className="bg-[#FFE500] px-1 border border-[#111]">CLICKER</span>
            </span>
          </Link>

          <div className="hidden sm:flex items-center gap-5">
            <Link href="/roadmap"   className="font-mono font-bold text-[13px] tracking-wide hover:underline underline-offset-2 text-[#111]">ROADMAP</Link>
            <Link href="/docs"      className="font-mono font-bold text-[13px] tracking-wide hover:underline underline-offset-2 text-[#111]">DOCS</Link>
            <span className="font-mono font-black text-[13px] tracking-wide border-b-2 border-[#111]">CHANGELOG</span>
            <a
              href={GITHUB_URL} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 border-[3px] border-[#111] px-3 py-2 text-[13px] font-mono font-bold hover:bg-[#FFE500] transition-colors"
              style={{ boxShadow: '4px 4px 0 #111' }}
            >
              <GitHubIcon size={16} /> GITHUB
            </a>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section
        className="pt-36 pb-16 px-5 text-center"
        style={{
          backgroundImage: 'linear-gradient(rgba(17,17,17,0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(17,17,17,0.055) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
        }}
      >
        <div className="max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-[#111] text-[#FFE500] font-mono font-black text-[11px] tracking-[2px] px-3 py-1.5 mb-6 rounded-sm">
            <span aria-hidden="true">📋</span> CHANGELOG
          </div>
          <h1
            className="font-black tracking-[-4px] leading-[0.88] mb-6"
            style={{ fontSize: 'clamp(52px, 10vw, 100px)' }}
          >
            WHAT&apos;S<br />
            <span
              className="inline-block bg-[#FFE500] border-[3px] border-[#111] px-3"
              style={{ boxShadow: '7px 7px 0 #111' }}
            >
              CHANGED
            </span>
          </h1>
          <p className="text-[#555] text-[17px] max-w-xl mx-auto leading-relaxed">
            Every release, every fix, every improvement — in one place.
          </p>
        </div>
      </section>

      {/* ── STATS STRIP ── */}
      <div className="border-y-[3px] border-[#111] bg-[#111]">
        <div className="max-w-6xl mx-auto px-5 py-4 flex flex-wrap gap-6 justify-center sm:justify-between items-center">
          {[
            { label: 'CURRENT VERSION', value: `v${RELEASES[0].version}` },
            { label: 'TOTAL RELEASES',  value: String(RELEASES.length) },
            { label: 'SINCE',           value: new Date(RELEASES[RELEASES.length - 1].date).getFullYear().toString() },
            { label: 'TOTAL CHANGES',   value: String(RELEASES.reduce((n, r) => n + r.changes.length, 0)) },
          ].map(({ label, value }) => (
            <div key={label} className="text-center">
              <div className="font-mono text-[10px] tracking-[2px] text-[#666] mb-0.5">{label}</div>
              <div className="font-mono font-black text-[22px] text-[#FFE500] tracking-tight">{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── TIMELINE ── */}
      <div className="max-w-3xl mx-auto px-5 py-16">

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 font-mono text-[11px] text-[#888] mb-10">
          <Link href="/" className="hover:text-[#444] transition-colors">Home</Link>
          <span>/</span>
          <span className="text-[#444]">Changelog</span>
        </div>

        {/* Vertical timeline line */}
        <div className="relative lg:pl-8">
          <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#111] hidden lg:block" />

          {RELEASES.map((release, i) => (
            <ReleaseCard key={release.version} release={release} index={i} />
          ))}
        </div>

        {/* Bottom CTA */}
        <div
          className="mt-4 p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 border-[3px] border-[#111] bg-white"
          style={{ boxShadow: '7px 7px 0 #111' }}
        >
          <div>
            <p className="font-mono font-black text-[11px] tracking-[2px] text-[#888] mb-1">OLDER HISTORY</p>
            <p className="font-black text-[20px] leading-tight">Full commit history on GitHub.</p>
            <p className="font-mono text-[12px] text-[#888] mt-1">Every change is documented in the git log.</p>
          </div>
          <a
            href={`${GITHUB_URL}/commits/main`}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 font-mono font-black text-[13px] tracking-wide px-6 py-3 border-[3px] border-[#111] hover:bg-[#FFE500] transition-colors"
            style={{ boxShadow: '5px 5px 0 #111' }}
          >
            VIEW COMMITS ↗
          </a>
        </div>
      </div>

      {/* ── FOOTER ── */}
      <footer className="border-t-[3px] border-[#111] bg-[#111] text-[#888]">
        <div className="max-w-6xl mx-auto px-5 py-8 flex flex-wrap gap-6 items-center justify-between">
          <span className="font-mono text-[12px]">YT DeClicker — open source, always free.</span>
          <div className="flex items-center gap-5 font-mono text-[12px]">
            <Link href="/"          className="hover:text-white transition-colors">HOME</Link>
            <Link href="/docs"      className="hover:text-white transition-colors">DOCS</Link>
            <Link href="/roadmap"   className="hover:text-white transition-colors">ROADMAP</Link>
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">GITHUB ↗</a>
          </div>
        </div>
      </footer>

    </main>
  )
}
