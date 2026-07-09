'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { motion } from 'motion/react';
import { Apple, Monitor, Laptop, Download } from 'lucide-react';
import { siGithub } from 'simple-icons';

const ParticleImage = dynamic(() => import('./particle-image').then((m) => m.ParticleImage), { ssr: false });

const navColumns = [
  {
    title: 'Product',
    links: [
      { label: 'Features', href: '#features' },
      { label: 'Install', href: '#install' },
      { label: 'Changelog', href: '/changelog', internal: true },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'GitHub', href: 'https://github.com/asta-nguyen/kamehadb' },
      { label: 'Releases', href: 'https://github.com/asta-nguyen/kamehadb/releases' },
      { label: 'Docs', href: 'https://github.com/asta-nguyen/kamehadb#readme' },
    ],
  },
];

export function ParticleFooter() {
  return (
    <footer className="bg-gradient-to-b from-zinc-900/80 to-black/60">
      <div className="mx-auto max-w-6xl px-8 py-12">
        <div className="flex items-center gap-12">
          {/* Particle logo */}
          <div className="relative h-56 w-56 shrink-0 overflow-hidden">
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
          <div className="flex flex-1 items-start gap-8">
            {/* CTA */}
            <div className="flex flex-1 flex-col gap-3">
              <p className="text-2xl font-extrabold tracking-tight text-zinc-100">One app for every database you run</p>
              <p className="text-sm leading-relaxed text-zinc-500">
                Free, open source, and local-first. No telemetry, no cloud proxy — your data stays on your machine.
              </p>
              <div className="mt-2 flex items-center gap-4 flex-wrap">
                <motion.a
                  href="https://github.com/asta-nguyen/kamehadb/releases"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-6 py-2.5 text-sm font-semibold text-white transition-all hover:bg-amber-600 hover:shadow-lg hover:shadow-amber-500/25"
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
                      className="flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium text-zinc-500 bg-zinc-900/60 border border-white/5 transition-colors hover:border-amber-500/30 hover:text-amber-400"
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
                  <h4 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-zinc-600">{col.title}</h4>
                  <ul className="flex flex-col gap-2 list-none p-0 m-0">
                    {col.links.map((l) => (
                      <li key={l.label}>
                        {'internal' in l && l.internal ? (
                          <Link
                            href={l.href}
                            className="text-sm font-medium text-zinc-500 transition-colors hover:text-amber-500"
                          >
                            {l.label}
                          </Link>
                        ) : (
                          <a
                            href={l.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-zinc-500 transition-colors hover:text-amber-500"
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
      <div className="mx-auto max-w-6xl px-8 pb-6 pt-4 border-t border-white/5 flex items-center justify-between">
        <span className="font-mono text-[11px] text-zinc-600">© {new Date().getFullYear()} KamehaDB</span>
        <a
          href="https://github.com/asta-nguyen/kamehadb"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="GitHub"
          className="text-zinc-600 transition-colors hover:text-amber-500"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d={siGithub.path} />
          </svg>
        </a>
      </div>
    </footer>
  );
}
