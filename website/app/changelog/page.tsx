import type { Metadata } from 'next'
import ChangelogContent from './ChangelogContent'

export const metadata: Metadata = {
  title: 'Changelog',
  description:
    'Every release of Ripple Wave documented — new features, improvements, bug fixes, and the full version history of the keyboard click remover Chrome extension for YouTube, Twitch, Reddit, and more.',
  alternates: { canonical: '/changelog' },
  openGraph: {
    title: 'Ripple Wave Changelog',
    description:
      'Full version history of the Ripple Wave Chrome extension — every feature, fix, and improvement.',
    url: 'https://ripplewave.app/changelog',
  },
  other: {
    'script:ld+json': JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home',      item: 'https://ripplewave.app' },
        { '@type': 'ListItem', position: 2, name: 'Changelog', item: 'https://ripplewave.app/changelog' },
      ],
    }),
  },
}

export default function ChangelogPage() {
  return <ChangelogContent />
}
