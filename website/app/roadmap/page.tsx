import type { Metadata } from 'next'
import RoadmapContent from './RoadmapContent'

export const metadata: Metadata = {
  title: 'Roadmap',
  description:
    "See what's planned for YT DeClicker: upcoming noise removal engines, browser support, features voted by the community, and the development roadmap.",
  alternates: { canonical: '/roadmap' },
  openGraph: {
    title: 'YT DeClicker Roadmap',
    description:
      'Upcoming features, community vote results, and the development roadmap for the YT DeClicker Chrome extension.',
    url: 'https://ytdeclicker.com/roadmap',
  },
  other: {
    'script:ld+json': JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://ytdeclicker.com' },
        { '@type': 'ListItem', position: 2, name: 'Roadmap', item: 'https://ytdeclicker.com/roadmap' },
      ],
    }),
  },
}

export default function RoadmapPage() {
  return <RoadmapContent />
}
