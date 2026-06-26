import type { Metadata } from 'next';
import { getBaseUrl, PRODUCTION_URL } from '@/lib/url';
import { jetbrainsMono, outfit } from './fonts';
import './globals.css';
import Providers from './providers';

export async function generateMetadata(): Promise<Metadata> {
  const baseUrl = await getBaseUrl();

  return {
    metadataBase: new URL(baseUrl),
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
    authors: [{ name: 'KamehaDB', url: baseUrl }],
    creator: 'KamehaDB',
    openGraph: {
      type: 'website',
      locale: 'en_US',
      url: baseUrl,
      siteName: 'KamehaDB',
      title: 'KamehaDB — Local-first desktop database workspace',
      description:
        'One local-first desktop GUI for PostgreSQL, MySQL, MariaDB, SQLite, SQL Server, Oracle, ClickHouse, DuckDB, MongoDB, Redis, Qdrant, and TigerBeetle, with AI built in.',
    },
    alternates: {
      canonical: '/',
    },
    twitter: {
      card: 'summary_large_image',
      title: 'KamehaDB — Local-first desktop database workspace',
      description:
        'One local-first desktop GUI for SQL, document, cache, vector, and ledger systems, with AI built in.',
      images: [`${baseUrl}/opengraph-image`],
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
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Use the static production URL for JSON-LD to avoid forcing request-time
  // rendering, which breaks Next.js static prerendering of the layout.
  const baseUrl = PRODUCTION_URL;

  return (
    <html
      lang="en"
      className={`${outfit.variable} ${jetbrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className={`${outfit.variable} ${jetbrainsMono.variable} min-h-full flex flex-col antialiased`}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            // Per Next.js JSON-LD guide: sanitize < for XSS prevention
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'SoftwareApplication',
              name: 'KamehaDB',
              description:
                'A cross-platform, local-first desktop GUI for SQL, document, cache, vector, and ledger systems — PostgreSQL, MySQL, MariaDB, SQLite, SQL Server, Oracle, ClickHouse, DuckDB, MongoDB, Redis, Qdrant, and TigerBeetle. Built with AI.',
              url: baseUrl,
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
                url: baseUrl,
              },
            }).replace(/</g, '\\u003c'), // XSS sanitization per Next.js JSON-LD guide
          }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
