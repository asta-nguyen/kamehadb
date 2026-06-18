import type { Metadata } from 'next';
import { jetbrainsMono, outfit } from './fonts';
import './globals.css';
import Providers from './providers';

const siteUrl = 'https://kamehadb.astalife.co';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'KamehaDB — Local-first desktop database workspace',
    template: '%s | KamehaDB',
  },
  description:
    'A cross-platform desktop GUI for SQL, document, cache, vector, and ledger systems. PostgreSQL, MySQL, MariaDB, SQLite, SQL Server, Oracle, ClickHouse, DuckDB, MongoDB, Redis, Qdrant, and TigerBeetle in one local-first app, with AI built in.',
  keywords: [
    'database management',
    'database client',
    'desktop database GUI',
    'SQL editor',
    'PostgreSQL',
    'MySQL',
    'MariaDB',
    'SQLite',
    'SQL Server',
    'Oracle',
    'ClickHouse',
    'DuckDB',
    'MongoDB',
    'Redis',
    'Qdrant',
    'vector database',
    'TigerBeetle',
    'AI query',
    'schema visualization',
    'ER diagram',
    'migration assistant',
    'Tauri',
    'open source',
    'local-first',
  ],
  authors: [{ name: 'KamehaDB', url: siteUrl }],
  creator: 'KamehaDB',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: siteUrl,
    siteName: 'KamehaDB',
    title: 'KamehaDB — Local-first desktop database workspace',
    description:
      'One local-first desktop GUI for PostgreSQL, MySQL, MariaDB, SQLite, SQL Server, Oracle, ClickHouse, DuckDB, MongoDB, Redis, Qdrant, and TigerBeetle, with AI built in.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'KamehaDB — Local-first desktop database workspace',
      },
    ],
  },
  alternates: {
    canonical: '/',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'KamehaDB — Local-first desktop database workspace',
    description: 'One local-first desktop GUI for SQL, document, cache, vector, and ledger systems, with AI built in.',
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
                'A cross-platform, local-first desktop GUI for SQL, document, cache, vector, and ledger systems — PostgreSQL, MySQL, MariaDB, SQLite, SQL Server, Oracle, ClickHouse, DuckDB, MongoDB, Redis, Qdrant, and TigerBeetle. Built with AI in.',
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
