import type { Metadata } from 'next';
import { jetbrainsMono, outfit } from './fonts';
import './globals.css';
import 'highlight.js/styles/github-dark-dimmed.css';
import Providers from './providers';

const siteUrl = 'https://kamehadb.astalife.co';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'KamehaDB - Database Management Reimagined',
    template: '%s | KamehaDB',
  },
  description:
    'Connect to PostgreSQL, MySQL, SQLite, MongoDB, and Redis — all from one unified interface. Explore schemas visually, query with AI, and manage databases effortlessly.',
  keywords: [
    'database management',
    'database client',
    'SQL editor',
    'PostgreSQL',
    'MySQL',
    'SQLite',
    'MongoDB',
    'Redis',
    'AI query',
    'schema visualization',
    'ER diagram',
    'database GUI',
    'Tauri',
    'open source',
  ],
  authors: [{ name: 'KamehaDB', url: siteUrl }],
  creator: 'KamehaDB',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: siteUrl,
    siteName: 'KamehaDB',
    title: 'KamehaDB - Database Management Reimagined',
    description:
      'Connect to any database, explore schemas visually, and query with AI. The modern database management tool built for developers.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'KamehaDB - Database Management Reimagined',
      },
    ],
  },
  alternates: {
    canonical: '/',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'KamehaDB - Database Management Reimagined',
    description: 'Connect to any database, explore schemas visually, and query with AI.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon-16x16.png',
    apple: '/apple-touch-icon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${outfit.variable} ${jetbrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'SoftwareApplication',
              name: 'KamehaDB',
              description:
                'Connect to PostgreSQL, MySQL, SQLite, MongoDB, and Redis — all from one unified interface. Explore schemas visually, query with AI, and manage databases effortlessly.',
              url: siteUrl,
              applicationCategory: 'DeveloperApplication',
              operatingSystem: 'Windows, macOS, Linux',
              offers: {
                '@type': 'Offer',
                price: '0',
                priceCurrency: 'USD',
              },
              softwareRequirements: 'Node.js 18+',
              author: {
                '@type': 'Organization',
                name: 'KamehaDB',
                url: siteUrl,
              },
            }),
          }}
        />
      </head>
      <body className={`${outfit.variable} ${jetbrainsMono.variable} min-h-full flex flex-col antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
