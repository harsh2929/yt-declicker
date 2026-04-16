import type { Metadata, Viewport } from 'next'
import { Space_Grotesk, Space_Mono } from 'next/font/google'
import './globals.css'

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

const spaceMono = Space_Mono({
  weight: ['400', '700'],
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
})

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export const metadata: Metadata = {
  metadataBase: new URL('https://ripplewave.app'),
  title: {
    default: 'Ripple Wave — Keyboard Click Remover for YouTube, Twitch, Reddit & More',
    template: '%s | Ripple Wave',
  },
  description:
    'Ripple Wave is a free Chrome extension that removes keyboard clicks and typing noise from YouTube, Reddit, X/Twitter, Twitch, Facebook, LinkedIn, and Kick videos in real-time. Three AI engines: EQ Lite, RNNoise ML, and DeepFilterNet3.',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'Ripple Wave — Keyboard Click Remover for YouTube, Twitch, Reddit & More',
    description:
      'Free Chrome extension for real-time noise removal on YouTube, Reddit, X, Twitch, Facebook, LinkedIn, and Kick. Removes keyboard clicks, typing noise, and mechanical key sounds instantly.',
    url: 'https://ripplewave.app',
    siteName: 'Ripple Wave',
    type: 'website',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Ripple Wave — silence keyboard noise on YouTube, Twitch, Reddit & more',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Ripple Wave — Keyboard Click Remover for YouTube, Twitch, Reddit & More',
    description:
      'Free Chrome extension for real-time noise removal on 7 platforms.',
    images: ['/og-image.png'],
  },
  keywords: [
    'keyboard click remover Chrome extension',
    'remove keyboard noise YouTube',
    'YouTube noise removal Chrome extension',
    'Twitch keyboard noise filter',
    'Reddit typing noise remover',
    'keyboard click filter',
    'mechanical keyboard noise removal',
    'typing noise filter YouTube Twitch Reddit',
    'DeepFilterNet3 Chrome extension',
    'RNNoise browser',
    'Facebook LinkedIn Kick noise filter',
    'X Twitter keyboard click remover',
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className={`${spaceGrotesk.variable} ${spaceMono.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  )
}
