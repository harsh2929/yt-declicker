import type { Metadata } from 'next'
import RoadmapContent from './RoadmapContent'

export const metadata: Metadata = {
  title: 'Roadmap',
  description:
    "See what's planned for Ripple Wave: upcoming noise removal engines, browser support, features voted by the community, and the development roadmap.",
  alternates: { canonical: '/roadmap' },
  openGraph: {
    title: 'Ripple Wave Roadmap',
    description:
      'Upcoming features, community vote results, and the development roadmap for the Ripple Wave Chrome extension.',
    url: 'https://ripplewave.app/roadmap',
  },
  other: {
    'script:ld+json': JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://ripplewave.app' },
        { '@type': 'ListItem', position: 2, name: 'Roadmap', item: 'https://ripplewave.app/roadmap' },
      ],
    }),
  },
}

export default function RoadmapPage() {
  return <RoadmapContent />
}
