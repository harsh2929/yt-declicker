'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

const GITHUB_URL = 'https://github.com/harsh2929/yt-declicker'

// ─────────────────────────────────────────────────────────────────────────────
// TOC SECTIONS
// ─────────────────────────────────────────────────────────────────────────────
const SECTIONS = [
  { id: 'overview',      label: 'Overview'                  },
  { id: 'architecture',  label: 'Extension Architecture'    },
  { id: 'audio-pipeline',label: 'Web Audio Pipeline'        },
  { id: 'eq-engine',     label: 'Engine: EQ Lite'           },
  { id: 'rnn-engine',    label: 'Engine: RNNoise'           },
  { id: 'deep-engine',   label: 'Engine: DeepFilterNet3'    },
  { id: 'csp-bypass',    label: 'CSP Bypass & Downloads'    },
  { id: 'storage',       label: 'Configuration & Storage'   },
  { id: 'privacy',       label: 'Privacy & Security'        },
]

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function Code({ children }: { children: string }) {
  return (
    <code
      className="font-mono text-[13px] px-1.5 py-0.5 rounded-sm"
      style={{ background: 'rgba(100,210,255,0.15)', border: '1px solid rgba(100,210,255,0.3)', color: '#64D2FF' }}
    >
      {children}
    </code>
  )
}

function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="font-mono text-[13px] px-1.5 py-0.5"
      style={{ background: 'rgba(100,210,255,0.12)', border: '1px solid rgba(100,210,255,0.25)', color: '#64D2FF' }}
    >
      {children}
    </span>
  )
}

function Block({ children, accent = '#64D2FF' }: { children: React.ReactNode; accent?: string }) {
  return (
    <pre
      className="text-[13px] leading-relaxed p-5 overflow-x-auto font-mono"
      style={{
        background: '#0d0d0d',
        border: `3px solid ${accent}`,
        boxShadow: `5px 5px 0 ${accent}`,
        color: '#e0e0e0',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      {children}
    </pre>
  )
}

function SectionTag({ color, children }: { color: string; children: string }) {
  return (
    <span
      className="font-mono font-black text-[10px] tracking-[2px] px-2.5 py-1 inline-block mb-4"
      style={{ background: color, border: '2px solid #111' }}
    >
      {children}
    </span>
  )
}

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2
      id={id}
      className="font-black tracking-[-1.5px] leading-none mb-5 scroll-mt-24"
      style={{ fontSize: 'clamp(26px, 3.5vw, 40px)' }}
    >
      {children}
    </h2>
  )
}

function H3({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-mono font-black text-[17px] tracking-wide mb-3 mt-8">
      {children}
    </h3>
  )
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[#ccc] text-[15px] leading-[1.75] mb-4">{children}</p>
}

function Divider() {
  return <hr className="border-[#333] my-10" />
}

function Badge({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="inline-flex flex-col mr-3 mb-3">
      <span className="font-mono text-[9px] text-[#888] tracking-[1px] mb-0.5">{label}</span>
      <span
        className="font-mono font-black text-[12px] px-2 py-1 border-2 border-ink"
        style={{ background: color, color: '#111' }}
      >
        {value}
      </span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function DocsPage() {
  const [active, setActive] = useState('overview')
  const observerRef = useRef<IntersectionObserver | null>(null)

  // Track which section is visible in the TOC
  useEffect(() => {
    observerRef.current?.disconnect()
    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id)
        }
      },
      { rootMargin: '-20% 0px -60% 0px', threshold: 0 }
    )
    SECTIONS.forEach(s => {
      const el = document.getElementById(s.id)
      if (el) observerRef.current!.observe(el)
    })
    return () => observerRef.current?.disconnect()
  }, [])

  return (
    <div className="min-h-screen" style={{ background: '#111', color: '#f0f0f0' }}>
      {/* Top nav */}
      <nav
        className="fixed top-0 left-0 right-0 z-50 border-b-[3px] border-[#333]"
        style={{ background: '#111', backdropFilter: 'blur(8px)' }}
      >
        <div className="max-w-7xl mx-auto px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <div className="w-7 h-7 bg-yellow font-mono font-black text-[10px] flex items-center justify-center border-2 border-[#555] rounded-sm" style={{ color: '#111' }}>
                YD
              </div>
              <span className="font-black text-[15px] tracking-tight text-white">
                YT De<span className="bg-yellow px-1 border border-[#555]" style={{ color: '#111' }}>CLICKER</span>
              </span>
            </Link>
            <span className="text-[#555] font-mono text-[12px] hidden sm:block">/ docs</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/roadmap" className="font-mono font-bold text-[12px] text-[#888] hover:text-white tracking-wide transition-colors">ROADMAP</Link>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono font-bold text-[12px] text-[#888] hover:text-white tracking-wide transition-colors"
            >
              GITHUB ↗
            </a>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-5 pt-14 flex gap-0">
        {/* ── Sticky sidebar ── */}
        <aside className="hidden lg:block w-60 shrink-0 sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto py-10 pr-6 border-r-[2px] border-[#222]">
          <p className="font-mono font-black text-[9px] tracking-[3px] text-[#555] mb-4">ON THIS PAGE</p>
          <nav className="flex flex-col gap-0.5">
            {SECTIONS.map(s => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="font-mono text-[12px] px-3 py-1.5 transition-all"
                style={{
                  color: active === s.id ? '#FFE500' : '#888',
                  background: active === s.id ? 'rgba(255,229,0,0.08)' : 'transparent',
                  borderLeft: active === s.id ? '3px solid #FFE500' : '3px solid transparent',
                  fontWeight: active === s.id ? 700 : 400,
                }}
              >
                {s.label}
              </a>
            ))}
          </nav>

          <div className="mt-10 pt-6 border-t border-[#222]">
            <p className="font-mono text-[10px] text-[#555] leading-relaxed">
              Extension version: <span className="text-[#888]">v3</span><br />
              Manifest: <span className="text-[#888]">v3</span><br />
              Runtime: <span className="text-[#888]">Web Audio API</span>
            </p>
          </div>
        </aside>

        {/* ── Main content ── */}
        <main className="flex-1 min-w-0 py-12 lg:px-12 max-w-3xl">

          {/* Breadcrumb */}
          <div className="flex items-center gap-2 font-mono text-[11px] text-[#555] mb-8">
            <Link href="/" className="hover:text-[#888] transition-colors">Home</Link>
            <span>/</span>
            <span className="text-[#888]">Technical Docs</span>
          </div>

          {/* Page title */}
          <div className="mb-14">
            <div
              className="inline-block font-mono font-black text-[10px] tracking-[3px] px-3 py-1.5 mb-5"
              style={{ background: '#FFE500', border: '2px solid #111', color: '#111' }}
            >
              TECHNICAL REFERENCE
            </div>
            <h1
              className="font-black tracking-[-3px] leading-none text-white mb-5"
              style={{ fontSize: 'clamp(38px, 5vw, 64px)' }}
            >
              YT DECLICKER<br /><span style={{ color: '#FFE500' }}>v3 DOCS</span>
            </h1>
            <p className="text-[#999] text-[16px] leading-relaxed max-w-xl">
              Deep technical internals of the extension — audio pipeline, engine architectures, CSP bypass strategy, and storage schema.
            </p>
          </div>

          {/* ────────────────────────── OVERVIEW ────────────────────────── */}
          <section id="overview" className="scroll-mt-24 mb-14">
            <SectionTag color="#FFE500">OVERVIEW</SectionTag>
            <H2 id="overview">How It Works</H2>

            <P>
              YT DeClicker v3 is a Chrome Manifest v3 extension that intercepts
              YouTube&apos;s <InlineCode>&lt;video&gt;</InlineCode> element and routes its audio
              through a real-time processing chain before it reaches your speakers — without
              touching the network or any server.
            </P>

            <Block accent="#FFE500">
{`YouTube <video> element
    │
    ▼  MediaElementSource (Web Audio API)
┌───────────────────────────────────┐
│   Your chosen filter engine:      │
│   EQ Lite  /  RNNoise  /         │
│   DeepFilterNet3                  │
└───────────────────────────────────┘
    │
    ▼  AudioContext.destination
Your speakers / headphones`}
            </Block>

            <P>
              The key insight: Web Audio API&apos;s <InlineCode>MediaElementSourceNode</InlineCode> lets
              you tap the audio stream from any HTML media element. Once tapped, the stream can be
              processed by any combination of native <InlineCode>AudioNode</InlineCode>s or custom
              <InlineCode>AudioWorkletProcessor</InlineCode>s before it plays out.
            </P>
          </section>

          <Divider />

          {/* ────────────────────────── ARCHITECTURE ────────────────────── */}
          <section id="architecture" className="scroll-mt-24 mb-14">
            <SectionTag color="#30D158">ARCHITECTURE</SectionTag>
            <H2 id="architecture">Extension Architecture</H2>

            <P>
              Built on Manifest v3, the extension is structured into four distinct layers that
              communicate via Chrome&apos;s messaging APIs and shared storage.
            </P>

            <Block accent="#30D158">
{`chrome-extension/
├── manifest.json          MV3 declaration
│
├── content_script.js      Injected into every YouTube tab
│   ├── Hooks <video> element via MutationObserver
│   ├── Constructs AudioContext + chosen filter chain
│   └── Listens for settings changes via chrome.storage.onChanged
│
├── background.js          Service worker (persistent-ish)
│   ├── Handles model download for DeepFilterNet3
│   ├── Routes large fetch() calls to bypass YouTube CSP
│   └── Manages extension lifecycle events
│
├── popup/                 Extension popup UI
│   ├── popup.html + popup.js
│   ├── Engine selector, intensity slider, presets
│   └── Writes to chrome.storage.sync → triggers content_script
│
└── worklets/
    ├── rnnoise-worklet.js    AudioWorklet wrapping RNNoise WASM
    └── deepfilter-worklet.js AudioWorklet wrapping DeepFilterNet3`}
            </Block>

            <H3>Content Script Injection</H3>
            <P>
              The content script runs at <InlineCode>document_idle</InlineCode> on all
              <InlineCode>youtube.com/*</InlineCode> URLs. It uses a{' '}
              <InlineCode>MutationObserver</InlineCode> to watch for YouTube&apos;s
              client-side navigation (YouTube is a SPA — the DOM mutates rather
              than triggering full page loads). When a <InlineCode>&lt;video&gt;</InlineCode>{' '}
              element appears or changes, the hook re-attaches automatically.
            </P>

            <Block>
{`// Simplified hook logic in content_script.js
const observer = new MutationObserver(() => {
  const video = document.querySelector('video')
  if (video && !video.__ydHooked) {
    attachFilterChain(video)
    video.__ydHooked = true
  }
})
observer.observe(document.body, { childList: true, subtree: true })`}
            </Block>

            <H3>Settings Flow</H3>
            <P>
              When you change engine or intensity in the popup,{' '}
              <InlineCode>chrome.storage.sync.set()</InlineCode> is called.
              The content script listens to{' '}
              <InlineCode>chrome.storage.onChanged</InlineCode> and immediately
              swaps the active <InlineCode>AudioNode</InlineCode> graph — no page reload required.
            </P>
          </section>

          <Divider />

          {/* ────────────────────────── AUDIO PIPELINE ───────────────────── */}
          <section id="audio-pipeline" className="scroll-mt-24 mb-14">
            <SectionTag color="#64D2FF">WEB AUDIO API</SectionTag>
            <H2 id="audio-pipeline">Web Audio Pipeline</H2>

            <P>
              All three engines share the same entry and exit points in the{' '}
              <InlineCode>AudioContext</InlineCode> graph. Only the middle processing
              nodes differ.
            </P>

            <Block accent="#64D2FF">
{`const ctx = new AudioContext({ sampleRate: 48000 })

// Source: tap the video element
const src = ctx.createMediaElementSource(videoElement)

// ──── Engine nodes go here ────
// (BiquadFilterNodes / AudioWorkletNode)

// Sink: play through speakers
processedNode.connect(ctx.destination)`}
            </Block>

            <H3>Sample Rate</H3>
            <P>
              The context is created at <InlineCode>48000 Hz</InlineCode> — matching
              YouTube&apos;s delivery format. Both RNNoise and DeepFilterNet3 expect
              48 kHz input natively, avoiding any resampling overhead.
            </P>

            <H3>AudioWorklet vs ScriptProcessorNode</H3>
            <P>
              The ML engines use <InlineCode>AudioWorkletNode</InlineCode> (not the
              deprecated <InlineCode>ScriptProcessorNode</InlineCode>). Worklets run
              in a dedicated audio rendering thread, separate from the main JS thread,
              so UI interactions never cause audio glitches or dropouts.
            </P>

            <Block>
{`// Registering the worklet module
await ctx.audioWorklet.addModule(
  chrome.runtime.getURL('worklets/rnnoise-worklet.js')
)
const workletNode = new AudioWorkletNode(ctx, 'rnnoise-processor')`}
            </Block>
          </section>

          <Divider />

          {/* ────────────────────────── EQ ENGINE ───────────────────────── */}
          <section id="eq-engine" className="scroll-mt-24 mb-14">
            <SectionTag color="#30D158">ENGINE 01</SectionTag>
            <H2 id="eq-engine">EQ Lite Engine</H2>

            <div className="flex flex-wrap mb-6">
              <Badge label="LATENCY"    value="~0 ms"      color="#30D158" />
              <Badge label="CPU"        value="NEGLIGIBLE" color="#30D158" />
              <Badge label="DOWNLOAD"   value="NONE"       color="#30D158" />
              <Badge label="TYPE"       value="EQ + COMP"  color="#30D158" />
            </div>

            <P>
              The EQ engine uses a chain of native{' '}
              <InlineCode>BiquadFilterNode</InlineCode>s — natively implemented by the
              browser, running in optimised C++ with effectively zero latency.
              Keyboard clicks concentrate energy in the 1–6 kHz range with short
              transient spikes, which is exactly what parametric EQ can surgically remove.
            </P>

            <H3>Filter Chain</H3>
            <Block accent="#30D158">
{`src
 ├─► BiquadFilter { type: 'peaking', frequency: 1200, gain: -Gdyn, Q: 2.5 }
 ├─► BiquadFilter { type: 'peaking', frequency: 2400, gain: -Gdyn, Q: 2.5 }
 ├─► BiquadFilter { type: 'peaking', frequency: 3800, gain: -Gdyn, Q: 3.0 }
 ├─► BiquadFilter { type: 'peaking', frequency: 5500, gain: -Gdyn, Q: 3.5 }
 └─► DynamicsCompressorNode { threshold: -24, knee: 8, ratio: 8, attack: 0.003 }
     └─► ctx.destination

Gdyn = intensity slider value mapped to [0 dB … 18 dB]`}
            </Block>

            <H3>Presets</H3>
            <P>
              The four presets map intensity to calibrated gain and compressor settings:
            </P>
            <Block>
{`LIGHT  → Gdyn = 6 dB,   ratio = 4:1,  threshold = -18 dBFS
MED    → Gdyn = 10 dB,  ratio = 6:1,  threshold = -22 dBFS
HEAVY  → Gdyn = 14 dB,  ratio = 8:1,  threshold = -26 dBFS
NUKE   → Gdyn = 18 dB,  ratio = 20:1, threshold = -32 dBFS`}
            </Block>

            <H3>Trade-offs</H3>
            <P>
              Aggressive EQ can colour speech at the targeted frequencies. The compressor
              helps catch transients the EQ misses, but very short attacks
              (sub-5 ms) may clip musical content. LIGHT mode is recommended for
              music-heavy videos; NUKE for pure talking-head content.
            </P>
          </section>

          <Divider />

          {/* ────────────────────────── RNNoise ENGINE ──────────────────── */}
          <section id="rnn-engine" className="scroll-mt-24 mb-14">
            <SectionTag color="#64D2FF">ENGINE 02</SectionTag>
            <H2 id="rnn-engine">RNNoise Engine</H2>

            <div className="flex flex-wrap mb-6">
              <Badge label="LATENCY"    value="~15 ms"     color="#64D2FF" />
              <Badge label="CPU"        value="LOW–MED"    color="#64D2FF" />
              <Badge label="DOWNLOAD"   value="BUNDLED"    color="#64D2FF" />
              <Badge label="MODEL SIZE" value="150 KB"     color="#64D2FF" />
            </div>

            <P>
              RNNoise is a recurrent neural network noise suppressor originally
              developed at Mozilla. It uses a Gated Recurrent Unit (GRU) architecture
              trained on a large corpus of speech + noise pairs. The WASM build
              (~150 KB) is bundled directly inside the extension — no download needed.
            </P>

            <H3>Architecture</H3>
            <Block accent="#64D2FF">
{`Input frame: 480 samples @ 48 kHz = 10 ms window
    │
    ▼
Bark-scale feature extraction (22 bands)
    │
    ▼
3 × GRU layers (96 units each)
    │
    ▼
Gain curve per Bark band → applied via FFT/IFFT
    │
    ▼
Output frame: 480 samples (noise-suppressed)`}
            </Block>

            <H3>AudioWorklet Integration</H3>
            <P>
              The worklet processor accumulates samples into 480-sample frames,
              passes them through the WASM module synchronously, and emits the
              processed frames to the output buffer. This introduces one frame of
              algorithmic latency (~10 ms) plus a small buffering delay (~5 ms),
              totalling ~15 ms end-to-end.
            </P>
            <Block>
{`// Inside rnnoise-worklet.js (simplified)
class RNNoiseProcessor extends AudioWorkletProcessor {
  process(inputs, outputs) {
    const input  = inputs[0][0]   // Float32Array, 128 samples
    const output = outputs[0][0]

    this.buffer.push(...input)
    while (this.buffer.length >= 480) {
      const frame = this.buffer.splice(0, 480)
      const clean = rnnoiseWasm.processFrame(frame)
      this.outQueue.push(...clean)
    }
    output.set(this.outQueue.splice(0, 128))
    return true
  }
}`}
            </Block>

            <H3>Frequency Coverage</H3>
            <P>
              Unlike the EQ engine which only targets 1–6 kHz, RNNoise operates
              across the full audible band (0–24 kHz in Bark domain). It suppresses
              keyboard clicks, fan hum, room noise, and even typing sounds
              simultaneously — treating them all as &quot;not speech.&quot;
            </P>
          </section>

          <Divider />

          {/* ────────────────────────── DEEPFILTER ENGINE ────────────────── */}
          <section id="deep-engine" className="scroll-mt-24 mb-14">
            <SectionTag color="#BF5AF2">ENGINE 03</SectionTag>
            <H2 id="deep-engine">DeepFilterNet3 Engine</H2>

            <div className="flex flex-wrap mb-6">
              <Badge label="LATENCY"    value="~25 ms"      color="#BF5AF2" />
              <Badge label="CPU"        value="MODERATE"    color="#BF5AF2" />
              <Badge label="DOWNLOAD"   value="~2 MB ONCE"  color="#BF5AF2" />
              <Badge label="QUALITY"    value="STATE OF ART" color="#BF5AF2" />
            </div>

            <P>
              DeepFilterNet3 is a full deep-learning speech enhancement model built
              on a dual-stage architecture: a Temporal Convolutional Network (TCN)
              for broad noise estimation, and an Enhancement GAN stage for waveform
              refinement. It is compiled to WASM via ONNX Runtime Web.
            </P>

            <H3>Model Architecture</H3>
            <Block accent="#BF5AF2">
{`Input: 20 ms frames @ 48 kHz (960 samples)
    │
    ▼
STFT → Complex spectrogram (481 bins × 2)
    │
    ▼
Encoder (5× depthwise conv blocks, dim=256)
    │
    ├─► TCN branch: coarse noise mask estimation
    │
    └─► GRU branch (512 units): temporal refinement
            │
            ▼
    Multiplicative mask application in frequency domain
            │
            ▼
    Overlap-add iSTFT → wideband clean audio`}
            </Block>

            <H3>WASM / ONNX Runtime</H3>
            <P>
              The model is serialised as an ONNX graph and loaded via{' '}
              <InlineCode>onnxruntime-web</InlineCode>. The WASM backend runs
              multi-threaded inference using{' '}
              <InlineCode>SharedArrayBuffer</InlineCode> when available (requires
              COOP/COEP headers — which the extension sets via its own service worker).
            </P>

            <H3>Processing Latency Breakdown</H3>
            <Block>
{`Frame size:          20 ms    (960 samples @ 48 kHz)
Model inference:     ~8 ms    (on modern hardware)
Buffering overhead:  ~5 ms
STFT/iSTFT:          ~2 ms
─────────────────────────────
Total:               ~25 ms   (imperceptible on videos)`}
            </Block>

            <H3>IndexedDB Caching</H3>
            <P>
              The ~2 MB model blob is downloaded once and stored in IndexedDB under
              the key <InlineCode>deepfilter_v3_model</InlineCode>. On subsequent
              activations the background service worker serves it from cache,
              making activation near-instant even on slow connections.
            </P>
          </section>

          <Divider />

          {/* ────────────────────────── CSP BYPASS ──────────────────────── */}
          <section id="csp-bypass" className="scroll-mt-24 mb-14">
            <SectionTag color="#FF9F0A">CSP &amp; DOWNLOADS</SectionTag>
            <H2 id="csp-bypass">CSP Bypass &amp; Model Downloads</H2>

            <P>
              YouTube enforces a strict Content Security Policy that blocks extension
              scripts from making arbitrary <InlineCode>fetch()</InlineCode> calls to
              external origins. Downloading the DeepFilterNet3 model directly from
              the content script would be blocked.
            </P>

            <H3>Service Worker Proxy</H3>
            <P>
              The MV3 background service worker is not subject to the page&apos;s CSP.
              The content script requests the model via Chrome&apos;s messaging API;
              the service worker performs the actual fetch and transfers the
              <InlineCode>ArrayBuffer</InlineCode> back via message:
            </P>
            <Block accent="#FF9F0A">
{`// content_script.js
chrome.runtime.sendMessage({ type: 'FETCH_MODEL' }, (response) => {
  const modelBuffer = response.arrayBuffer
  loadOrtSession(modelBuffer)
})

// background.js (service worker — no CSP)
chrome.runtime.onMessage.addListener((msg, _, sendResponse) => {
  if (msg.type === 'FETCH_MODEL') {
    fetch('https://cdn.example.com/deepfilter-v3.ort')
      .then(r => r.arrayBuffer())
      .then(buf => sendResponse({ arrayBuffer: buf }))
    return true  // async response
  }
})`}
            </Block>

            <H3>declarativeNetRequest</H3>
            <P>
              MV3 removes access to <InlineCode>webRequestBlocking</InlineCode>.
              Header modifications (required for <InlineCode>SharedArrayBuffer</InlineCode>{' '}
              — COOP/COEP) are instead declared statically via{' '}
              <InlineCode>declarativeNetRequest</InlineCode> rules in{' '}
              <InlineCode>manifest.json</InlineCode>, which Chrome applies
              before the page sees the response.
            </P>
          </section>

          <Divider />

          {/* ────────────────────────── STORAGE ─────────────────────────── */}
          <section id="storage" className="scroll-mt-24 mb-14">
            <SectionTag color="#FFE500">STORAGE</SectionTag>
            <H2 id="storage">Configuration &amp; Storage</H2>

            <H3>chrome.storage.sync Schema</H3>
            <P>
              User settings are persisted via <InlineCode>chrome.storage.sync</InlineCode>{' '}
              (synced across the user&apos;s Chrome profile):
            </P>
            <Block accent="#FFE500">
{`{
  "engine":    "eq" | "rnn" | "deep",   // active engine
  "intensity": 0–100,                    // suppression %
  "preset":    "light"|"med"|"heavy"|"nuke", // EQ only
  "enabled":   true | false,            // global on/off
  "autoStart": true | false             // re-attach on navigation
}`}
            </Block>

            <H3>IndexedDB Schema</H3>
            <P>
              Large binary assets (DeepFilterNet3 model, RNNoise WASM) are cached
              in <InlineCode>IndexedDB</InlineCode> database{' '}
              <InlineCode>yt-declicker-cache</InlineCode>:
            </P>
            <Block>
{`DB: "yt-declicker-cache"  version: 1
  ObjectStore: "assets"
    key: "deepfilter_v3_model"  → ArrayBuffer (~2 MB)
    key: "rnnoise_wasm"         → ArrayBuffer (~150 KB, redundant backup)
    key: "ort_wasm_simd"        → ArrayBuffer (~4 MB, ONNX runtime)`}
            </Block>

            <H3>Live Settings Updates</H3>
            <P>
              Changes in the popup propagate to active tabs via{' '}
              <InlineCode>chrome.storage.onChanged</InlineCode> — no message
              passing required. The content script handles the delta and hot-swaps
              the filter graph within a single audio render quantum (≤ 128 samples).
            </P>
          </section>

          <Divider />

          {/* ────────────────────────── PRIVACY ─────────────────────────── */}
          <section id="privacy" className="scroll-mt-24 mb-14">
            <SectionTag color="#30D158">PRIVACY &amp; SECURITY</SectionTag>
            <H2 id="privacy">Privacy &amp; Security</H2>

            <P>
              YT DeClicker processes audio entirely inside your browser. Here is the
              complete data flow audit:
            </P>

            <Block accent="#30D158">
{`Audio data:
  ✓ Stays in-browser (Web Audio API, local only)
  ✗ Never sent to any server
  ✗ Never recorded or buffered beyond one audio frame

Model download (DeepFilterNet3 only):
  ✓ One-time fetch from a static CDN
  ✓ Cached in local IndexedDB after first download
  ✗ Only the model weights are downloaded, no audio data

chrome.storage.sync:
  ✓ Only stores engine preference + intensity slider
  ✗ No browsing history, no URLs, no audio

Permissions in manifest.json:
  "permissions": ["storage", "activeTab", "scripting"]
  "host_permissions": ["*://*.youtube.com/*"]`}
            </Block>

            <H3>Open Source</H3>
            <P>
              Every line of code is public. Review the full source, the filter
              implementations, and the WASM build scripts on{' '}
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-yellow hover:underline"
              >
                GitHub ↗
              </a>.
            </P>

            <H3>Third-Party Components</H3>
            <Block>
{`RNNoise      — BSD-2-Clause (Mozilla / Jean-Marc Valin)
DeepFilterNet — MIT License  (Hendrik Schröter et al.)
onnxruntime-web — MIT License (Microsoft)
All bundled as WASM — no external runtime calls`}
            </Block>
          </section>

          {/* ── Footer CTA ── */}
          <div
            className="mt-10 p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5"
            style={{ background: '#1a1a1a', border: '3px solid #FFE500', boxShadow: '7px 7px 0 #FFE500' }}
          >
            <div>
              <p className="font-mono font-black text-[11px] tracking-[2px] text-[#FFE500] mb-1">OPEN SOURCE</p>
              <p className="font-black text-[20px] text-white leading-tight">Questions? Read the source.</p>
              <p className="font-mono text-[12px] text-[#888] mt-1">All filter logic is public and auditable.</p>
            </div>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="neo-btn px-7 py-3 text-[13px] tracking-wide shrink-0"
              style={{ background: '#FFE500', color: '#111', border: '3px solid #111', boxShadow: '5px 5px 0 #111' }}
            >
              VIEW SOURCE →
            </a>
          </div>

        </main>
      </div>
    </div>
  )
}
