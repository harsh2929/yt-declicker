import type { Metadata } from 'next'
import DocsContent from './DocsContent'

export const metadata: Metadata = {
  title: 'Technical Docs — YT DeClicker v3',
  description:
    'Deep technical internals of the YT DeClicker Chrome extension: audio pipeline, EQ filters, RNNoise ML engine, DeepFilterNet3 AI, CSP bypass strategy, and storage schema.',
  alternates: { canonical: '/docs' },
  openGraph: {
    title: 'Technical Docs — YT DeClicker v3',
    description:
      'Audio pipeline, engine architectures, CSP bypass, and storage schema for the YT DeClicker Chrome extension.',
    url: 'https://ytdeclicker.com/docs',
  },
  // Breadcrumb structured data injected via metadata.other (Next.js App Router pattern)
  other: {
    'script:ld+json': JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://ytdeclicker.com' },
        { '@type': 'ListItem', position: 2, name: 'Technical Docs', item: 'https://ytdeclicker.com/docs' },
      ],
    }),
  },
}

export default function DocsPage() {
  return <DocsContent />
}
