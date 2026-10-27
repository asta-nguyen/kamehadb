'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { motion } from 'motion/react';
import { Apple, Monitor, Laptop, Download } from 'lucide-react';
import { siGithub } from 'simple-icons';
import { GITHUB_URL, RELEASES_URL } from '@/lib/links';

const ParticleImage = dynamic(() => import('./particle-image').then((m) => m.ParticleImage), { ssr: false });

const navColumns = [
  {
    title: 'Product',
    links: [
      { label: 'Features', href: '#features' },
      { label: 'Download', href: '#install' },
      { label: 'Changelog', href: '/changelog', internal: true },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'GitHub', href: GITHUB_URL },
      { label: 'Releases', href: RELEASES_URL },
      { label: 'Docs', href: `${GITHUB_URL}#readme` },
    ],
  },
];

export function ParticleFooter() {
  return (
    <footer className="bg-gradient-to-b from-zinc-900/80 to-black/60">
      <div className="mx-auto max-w-6xl px-4 py-10 md:px-8 md:py-12">
        {/* Stacked on phones so the 224px logo never pushes the CTA off-screen. */}
        <div className="flex flex-col items-center gap-8 md:flex-row md:gap-12">
          {/* Particle logo */}
          <div className="relative h-40 w-40 shrink-0 overflow-hidden md:h-56 md:w-56">
            <ParticleImage
              src="/logo.png"
              density={2}
              radius={1.5}
              scatterRadius={130}
              scatterForce={4}
              ease={0.06}
              className="absolute inset-0 h-full w-full"
            />
          </div>

          {/* CTA + nav — fills the right side */}
          <div className="flex w-full flex-1 flex-col gap-8 lg:flex-row lg:items-start">
            {/* CTA */}
            <div className="flex flex-1 flex-col gap-3">
              <p className="text-2xl font-extrabold tracking-tight text-zinc-100">One app for every database you run</p>
              <p className="text-sm leading-relaxed text-zinc-400">
                Free, open source, and local-first. No telemetry, no cloud proxy — your metadata stays on your machine.
                Remote AI providers receive only the conversation and schema context you send them.
              </p>
              <div className="mt-2 flex items-center gap-4 flex-wrap">
                <motion.a
                  href={RELEASES_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-6 py-2.5 text-sm font-semibold text-zinc-950 transition-all hover:bg-amber-600 hover:shadow-lg hover:shadow-amber-500/25"
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Download className="w-4 h-4" />
                  Download for free
                </motion.a>
                <div className="flex gap-1.5">
                  {[
                    { icon: Apple, label: 'macOS' },
                    { icon: Monitor, label: 'Windows' },
                    { icon: Laptop, label: 'Linux' },
                  ].map((os) => (
                    <div
                      key={os.label}
                      className="flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium text-zinc-400 bg-zinc-900/60 border border-white/5 transition-colors hover:border-amber-500/30 hover:text-amber-400"
                    >
                      <os.icon className="w-3 h-3" />
                      {os.label}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Nav columns */}
            <nav className="flex gap-10" aria-label="Footer">
              {navColumns.map((col) => (
                <div key={col.title} className="flex flex-col gap-2">
                  <h4 className="mb-1 text-xs font-bold uppercase tracking-wider text-zinc-400">{col.title}</h4>
                  <ul className="flex flex-col gap-2 list-none p-0 m-0">
                    {col.links.map((l) => (
                      <li key={l.label}>
                        {'internal' in l && l.internal ? (
                          <Link
                            href={l.href}
                            className="text-sm font-medium text-zinc-400 transition-colors hover:text-amber-400"
                          >
                            {l.label}
                          </Link>
                        ) : (
                          <a
                            href={l.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-zinc-400 transition-colors hover:text-amber-400"
                          >
                            {l.label}
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      {/* pb-20 reserves room for the fixed Ko-fi button so it never covers the copyright. */}
      <div className="mx-auto flex max-w-6xl items-center justify-between border-t border-white/5 px-4 pb-20 pt-4 md:px-8">
        <span className="font-mono text-xs text-zinc-400">© {new Date().getFullYear()} KamehaDB</span>
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="GitHub"
          className="text-zinc-400 transition-colors hover:text-amber-400"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d={siGithub.path} />
          </svg>
        </a>
      </div>
    </footer>
  );
}
