import fs from 'fs';
import path from 'path';
import type { Metadata } from 'next';
import { NavBar } from '@/components/nav-bar';
import { Footer } from '@/components/footer';

export const metadata: Metadata = {
  title: 'Changelog',
  description: "See what's new in KamehaDB — new features, bug fixes, and improvements.",
  alternates: {
    canonical: '/changelog',
  },
};

interface ChangeGroup {
  title: string | null;
  items: string[];
}

interface ChangeSection {
  type: string;
  groups: ChangeGroup[];
}

interface Release {
  version: string;
  date: string | null;
  description: string | null;
  sections: ChangeSection[];
}

function parseChangelog(content: string): Release[] {
  const releases: Release[] = [];
  const lines = content.split('\n');
  let currentRelease: Release | null = null;
  let currentSection: ChangeSection | null = null;
  let currentGroup: ChangeGroup | null = null;
  let descriptionBuffer: string[] = [];

  const appendGroupItem = (group: ChangeGroup | null, item: string) => {
    if (!group) {
      return;
    }

    group.items.push(item);
  };

  const appendGroupContinuation = (group: ChangeGroup | null, text: string) => {
    if (!group) {
      return;
    }

    const lastIndex = group.items.length - 1;
    if (lastIndex >= 0) {
      group.items[lastIndex] = `${group.items[lastIndex]} ${text}`.trim();
    }
  };

  const flushDescription = () => {
    if (!currentRelease) {
      descriptionBuffer = [];
      return;
    }

    const text = descriptionBuffer.join(' ').trim();
    currentRelease.description = text.length > 0 ? text : null;
    descriptionBuffer = [];
  };

  const ensureSection = (type: string) => {
    if (!currentRelease) {
      return null;
    }

    const section: ChangeSection = { type, groups: [] };
    currentRelease.sections.push(section);
    currentSection = section;
    currentGroup = null;
    return section;
  };

  const ensureGroup = (title: string | null) => {
    if (!currentSection) {
      return null;
    }

    const group: ChangeGroup = { title, items: [] };
    currentSection.groups.push(group);
    currentGroup = group;
    return group;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (trimmed === '---') {
      continue;
    }

    const versionMatch = line.match(/^## \[(.+?)\](?:\s*—\s*(.+))?$/);
    if (versionMatch) {
      if (currentRelease) {
        flushDescription();
        releases.push(currentRelease);
      }

      currentRelease = {
        version: versionMatch[1],
        date: versionMatch[2] || null,
        description: null,
        sections: [],
      };
      currentSection = null;
      currentGroup = null;
      continue;
    }

    if (!currentRelease) {
      continue;
    }

    const sectionMatch = line.match(/^### (.+)$/);
    if (sectionMatch) {
      flushDescription();
      ensureSection(sectionMatch[1]);
      continue;
    }

    const groupMatch = line.match(/^#### (.+)$/);
    if (groupMatch) {
      if (!currentSection) {
        ensureSection('Highlights');
      }
      ensureGroup(groupMatch[1]);
      continue;
    }

    const itemMatch = line.match(/^- (.+)$/);
    if (itemMatch) {
      if (!currentSection) {
        flushDescription();
        ensureSection('Highlights');
      }
      appendGroupItem(currentGroup ?? ensureGroup(null), itemMatch[1]);
      continue;
    }

    if (trimmed.length === 0) {
      continue;
    }

    if (currentSection === null) {
      descriptionBuffer.push(trimmed);
      continue;
    }

    appendGroupContinuation(currentGroup, trimmed);
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

function resolveChangelogPath(): string {
  const rootPath = path.join(process.cwd(), 'CHANGELOG.md');
  if (fs.existsSync(rootPath)) {
    return rootPath;
  }

  const landingPath = path.join(process.cwd(), '..', 'CHANGELOG.md');
  if (fs.existsSync(landingPath)) {
    return landingPath;
  }

  throw new Error('Unable to locate CHANGELOG.md');
}

export default function ChangelogPage() {
  const filePath = resolveChangelogPath();
  const content = fs.readFileSync(filePath, 'utf-8');
  const releases = parseChangelog(content);

  return (
    <div className="min-h-screen bg-canvas font-sans antialiased flex flex-col">
      {/* Navigation */}
      <NavBar />

      {/* Content */}
      <main className="pt-32 pb-24 px-6 flex-grow">
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

                    <div className="space-y-8">
                      {release.sections.map((section) => (
                        <div key={section.type}>
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold mb-3 ${typeColors[section.type] || 'bg-surface-soft text-body'}`}
                          >
                            {section.type}
                          </span>
                          <div className="space-y-5">
                            {section.groups.map((group, groupIndex) => (
                              <div key={group.title ?? `group-${groupIndex}`} className="space-y-2">
                                {group.title && (
                                  <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted">
                                    {group.title}
                                  </h3>
                                )}
                                <ul className="space-y-2">
                                  {group.items.map((item, i) => (
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
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
