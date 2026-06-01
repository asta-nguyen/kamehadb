import fs from 'fs';
import path from 'path';
import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import { ThemeToggle } from '../../components/theme-toggle';

export const metadata: Metadata = {
  title: 'Changelog',
  description: "See what's new in KamehaDB — new features, bug fixes, and improvements.",
  alternates: {
    canonical: '/changelog',
  },
};

interface ChangeEntry {
  type: string;
  items: string[];
}

interface Release {
  version: string;
  date: string | null;
  description: string | null;
  changes: ChangeEntry[];
}

function parseChangelog(content: string): Release[] {
  const releases: Release[] = [];
  const lines = content.split('\n');
  let currentRelease: Release | null = null;
  let currentType: string | null = null;
  let descriptionBuffer: string[] = [];

  const flushDescription = () => {
    if (currentRelease) {
      const text = descriptionBuffer.join(' ').trim();
      currentRelease.description = text.length > 0 ? text : null;
    }
    descriptionBuffer = [];
  };

  for (const line of lines) {
    const versionMatch = line.match(/^## \[(.+?)\](?:\s*-\s*(.+))?$/);
    if (versionMatch) {
      if (currentRelease) {
        flushDescription();
        releases.push(currentRelease);
      }
      currentRelease = {
        version: versionMatch[1],
        date: versionMatch[2] || null,
        description: null,
        changes: [],
      };
      currentType = null;
      continue;
    }

    const typeMatch = line.match(/^### (.+)$/);
    if (typeMatch && currentRelease) {
      flushDescription();
      currentType = typeMatch[1];
      currentRelease.changes.push({ type: currentType, items: [] });
      continue;
    }

    const itemMatch = line.match(/^- (.+)$/);
    if (itemMatch && currentRelease && currentType) {
      const section = currentRelease.changes.find((c) => c.type === currentType);
      if (section) section.items.push(itemMatch[1]);
      continue;
    }

    if (currentRelease && currentType === null && line.trim().length > 0) {
      descriptionBuffer.push(line.trim());
    }
  }

  if (currentRelease) {
    flushDescription();
    releases.push(currentRelease);
  }
  return releases;
}

function MarkdownText({ text }: { text: string }) {
  const tokenRegex = /(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)]+\))/g;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
    }
    if (match[1]) {
      nodes.push(
        <strong key={key++} className="font-semibold text-ink">
          {match[1].slice(2, -2)}
        </strong>,
      );
    } else if (match[2]) {
      const linkMatch = match[2].match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (linkMatch) {
        nodes.push(
          <a
            key={key++}
            href={linkMatch[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-600 dark:text-amber-400 hover:underline"
          >
            {linkMatch[1]}
          </a>,
        );
      }
    }
    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(<span key={key++}>{text.slice(lastIndex)}</span>);
  }

  return <>{nodes}</>;
}

const typeColors: Record<string, string> = {
  Added: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400',
  Changed: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400',
  Fixed: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400',
  Removed: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400',
};

export default function ChangelogPage() {
  const filePath = path.join(process.cwd(), '..', 'CHANGELOG.md');
  const content = fs.readFileSync(filePath, 'utf-8');
  const releases = parseChangelog(content);

  return (
    <div className="min-h-screen bg-canvas font-sans antialiased">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-canvas/70 border-b border-border/60">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group cursor-pointer">
            <div className="w-9 h-9 relative">
              <Image src="/logo.png" alt="KamehaDB" fill className="object-contain" />
            </div>
            <span className="font-bold text-ink text-lg">KamehaDB</span>
          </Link>
          <div className="flex items-center gap-6">
            <Link
              href="/"
              className="text-body hover:text-amber-600 dark:hover:text-amber-400 transition-colors text-sm font-medium"
            >
              Home
            </Link>
            <a
              href="https://github.com/asta-nguyen/kamehadb"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-xl transition-all hover:shadow-lg hover:shadow-amber-500/25"
            >
              GitHub
            </a>
            <ThemeToggle />
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="pt-32 pb-24 px-6">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-4xl font-extrabold text-ink tracking-tight mb-2">Changelog</h1>
          <p className="text-lg text-body mb-12">What&apos;s new in KamehaDB</p>

          <div className="space-y-12">
            {releases.map((release) => (
              <div key={release.version} className="relative">
                {/* Timeline line */}
                <div className="absolute left-3 top-10 bottom-0 w-px bg-border" />

                <div className="flex items-start gap-4">
                  {/* Timeline dot */}
                  <div className="relative z-10 w-6 h-6 rounded-full bg-amber-500 border-4 border-canvas shadow-sm flex-shrink-0 mt-1" />

                  <div className="flex-1 pb-4">
                    <div className="flex items-baseline gap-3 mb-4">
                      <h2 className="text-2xl font-bold text-ink">{release.version}</h2>
                      {release.date && <span className="text-sm text-muted font-medium">{release.date}</span>}
                    </div>

                    {release.description && <p className="text-body leading-relaxed mb-5">{release.description}</p>}

                    <div className="space-y-5">
                      {release.changes.map((section) => (
                        <div key={section.type}>
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold mb-3 ${typeColors[section.type] || 'bg-surface-soft text-body'}`}
                          >
                            {section.type}
                          </span>
                          <ul className="space-y-2">
                            {section.items.map((item, i) => (
                              <li key={i} className="flex items-start gap-2 text-body leading-relaxed">
                                <span className="text-muted mt-1.5 shrink-0">•</span>
                                <span className="flex-1">
                                  <MarkdownText text={item} />
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-12 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-9 h-9 relative">
              <Image src="/logo.png" alt="KamehaDB" fill className="object-contain" />
            </div>
            <span className="font-bold text-ink">KamehaDB</span>
          </Link>
        </div>
      </footer>
    </div>
  );
}
