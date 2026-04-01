import type { Metadata } from 'next'
import ChangelogContent from './ChangelogContent'

export const metadata: Metadata = {
  title: 'Changelog',
  description:
    'Every release of YT DeClicker documented — new features, improvements, bug fixes, and the full version history of the YouTube keyboard click remover Chrome extension.',
  alternates: { canonical: '/changelog' },
  openGraph: {
    title: 'YT DeClicker Changelog',
    description:
      'Full version history of the YT DeClicker Chrome extension — every feature, fix, and improvement.',
    url: 'https://ytdeclicker.com/changelog',
  },
  other: {
    'script:ld+json': JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home',      item: 'https://ytdeclicker.com' },
        { '@type': 'ListItem', position: 2, name: 'Changelog', item: 'https://ytdeclicker.com/changelog' },
      ],
    }),
  },
}

export default function ChangelogPage() {
  return <ChangelogContent />
}
