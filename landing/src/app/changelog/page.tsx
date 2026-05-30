import fs from 'fs';
import path from 'path';
import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import { ThemeToggle } from '../../components/theme-toggle';

export const metadata: Metadata = {
  title: 'Changelog',
  description: "See what's new in KamehaDB — new features, bug fixes, and improvements.",
};

interface ChangeEntry {
  type: string;
  items: string[];
}

interface Release {
  version: string;
  date: string | null;
  changes: ChangeEntry[];
}

function parseChangelog(content: string): Release[] {
  const releases: Release[] = [];
  const lines = content.split('\n');
  let currentRelease: Release | null = null;
  let currentType: string | null = null;

  for (const line of lines) {
    const versionMatch = line.match(/^## \[(.+?)\](?:\s*-\s*(.+))?$/);
    if (versionMatch) {
      if (currentRelease) releases.push(currentRelease);
      currentRelease = {
        version: versionMatch[1],
        date: versionMatch[2] || null,
        changes: [],
      };
      currentType = null;
      continue;
    }

    const typeMatch = line.match(/^### (.+)$/);
    if (typeMatch && currentRelease) {
      currentType = typeMatch[1];
      currentRelease.changes.push({ type: currentType, items: [] });
      continue;
    }

    const itemMatch = line.match(/^- (.+)$/);
    if (itemMatch && currentRelease && currentType) {
      const section = currentRelease.changes.find((c) => c.type === currentType);
      if (section) section.items.push(itemMatch[1]);
    }
  }

  if (currentRelease) releases.push(currentRelease);
  return releases;
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
    <div className="min-h-screen bg-white dark:bg-[#0b0f1a] font-sans antialiased">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-white/70 dark:bg-[#0b0f1a]/70 border-b border-slate-200/60 dark:border-slate-800/60">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group cursor-pointer">
            <div className="w-9 h-9 relative">
              <Image src="/logo.png" alt="KamehaDB" fill className="object-contain" />
            </div>
            <span className="font-bold text-slate-900 dark:text-slate-100 text-lg">KamehaDB</span>
          </Link>
          <div className="flex items-center gap-6">
            <Link
              href="/"
              className="text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors text-sm font-medium"
            >
              Home
            </Link>
            <a
              href="https://github.com/asta-nguyen/kamehadb"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium rounded-xl transition-all hover:shadow-lg hover:shadow-indigo-500/25"
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
          <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-2">Changelog</h1>
          <p className="text-lg text-slate-600 dark:text-slate-400 mb-12">What&apos;s new in KamehaDB</p>

          <div className="space-y-12">
            {releases.map((release) => (
              <div key={release.version} className="relative">
                {/* Timeline line */}
                <div className="absolute left-[11px] top-10 bottom-0 w-px bg-slate-200 dark:bg-slate-700" />

                <div className="flex items-start gap-4">
                  {/* Timeline dot */}
                  <div className="relative z-10 w-6 h-6 rounded-full bg-indigo-500 border-4 border-white dark:border-[#0b0f1a] shadow-sm flex-shrink-0 mt-1" />

                  <div className="flex-1 pb-4">
                    <div className="flex items-baseline gap-3 mb-4">
                      <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{release.version}</h2>
                      {release.date && (
                        <span className="text-sm text-slate-500 dark:text-slate-400 font-medium">{release.date}</span>
                      )}
                    </div>

                    <div className="space-y-5">
                      {release.changes.map((section) => (
                        <div key={section.type}>
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold mb-3 ${typeColors[section.type] || 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}
                          >
                            {section.type}
                          </span>
                          <ul className="space-y-2">
                            {section.items.map((item, i) => (
                              <li
                                key={i}
                                className="flex items-start gap-2 text-slate-700 dark:text-slate-300 leading-relaxed"
                              >
                                <span className="text-slate-400 dark:text-slate-500 mt-1.5 flex-shrink-0">•</span>
                                <span>{item}</span>
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
      <footer className="border-t border-slate-200 dark:border-slate-800 py-12 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-9 h-9 relative">
              <Image src="/logo.png" alt="KamehaDB" fill className="object-contain" />
            </div>
            <span className="font-bold text-slate-900 dark:text-white">KamehaDB</span>
          </Link>
        </div>
      </footer>
    </div>
  );
}
