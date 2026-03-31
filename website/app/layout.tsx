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
  metadataBase: new URL('https://ytdeclicker.com'),
  title: {
    default: 'YT DeClicker — YouTube Keyboard Click Remover Chrome Extension',
    template: '%s | YT DeClicker',
  },
  description:
    'YT DeClicker is a free Chrome extension that removes keyboard clicks and typing noise from YouTube videos in real-time. Three AI engines: EQ Lite, RNNoise ML, and DeepFilterNet3.',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'YT DeClicker — YouTube Keyboard Click Remover Chrome Extension',
    description:
      'Free Chrome extension for real-time YouTube noise removal. Removes keyboard clicks, typing noise, and mechanical key sounds instantly.',
    url: 'https://ytdeclicker.com',
    siteName: 'YT DeClicker',
    type: 'website',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'YT DeClicker — silence keyboard noise on YouTube',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'YT DeClicker — YouTube Keyboard Click Remover',
    description:
      'Free Chrome extension for real-time YouTube noise removal.',
    images: ['/og-image.png'],
  },
  keywords: [
    'YouTube keyboard click remover',
    'remove keyboard noise YouTube',
    'YouTube noise removal Chrome extension',
    'keyboard click filter',
    'mechanical keyboard noise removal',
    'typing noise filter YouTube',
    'DeepFilterNet3 Chrome extension',
    'RNNoise browser',
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
