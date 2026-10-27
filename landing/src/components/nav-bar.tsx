'use client';

import { Menu, X } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { siGithub } from 'simple-icons';
import { GITHUB_URL } from '@/lib/links';
import { ThemeToggle } from './theme-toggle';

// Single source of truth for top-level navigation. Hash links use "/#..." so
// they also resolve when the visitor is on /team or /changelog.
const NAV_LINKS = [
  { label: 'Features', href: '/#features' },
  { label: 'Download', href: '/#install' },
  { label: 'Changelog', href: '/changelog' },
  { label: 'Team', href: '/team' },
] as const;

const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500';

// Shared top bar. Below `md` the text links collapse into a toggled panel so
// phones can still reach every page; the GitHub CTA and theme toggle stay visible.
export function NavBar() {
  const [open, setOpen] = useState(false);

  // Escape closes the panel, matching what `aria-expanded` promises to keyboard users.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <nav
      aria-label="Primary"
      className="fixed left-0 right-0 top-0 z-50 border-b border-border/60 bg-canvas/80 shadow-sm backdrop-blur-md"
    >
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:rounded-md focus:bg-amber-500 focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-zinc-950"
      >
        Skip to content
      </a>
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-6">
        <Link href="/" className="flex items-center gap-2 group cursor-pointer">
          <div className="w-9 h-9 relative">
            <Image src="/logo.png" alt="KamehaDB" fill className="object-contain" />
          </div>
          <span className="font-bold text-ink text-lg">KamehaDB</span>
        </Link>
        <div className="flex items-center gap-3 md:gap-6">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`hidden rounded-md text-sm font-medium text-body transition-colors hover:text-amber-700 dark:hover:text-amber-400 md:inline-flex ${FOCUS_RING}`}
            >
              {link.label}
            </Link>
          ))}
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950 shadow-[var(--shadow-warm-glow)] transition-all hover:-translate-y-0.5 hover:bg-amber-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path d={siGithub.path} />
            </svg>
            GitHub
          </a>
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? 'Close menu' : 'Open menu'}
            className={`flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-canvas text-ink transition-colors hover:bg-surface-soft md:hidden ${FOCUS_RING}`}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {open && (
        <div id="mobile-nav" className="border-t border-border/60 bg-canvas md:hidden">
          <div className="mx-auto flex max-w-6xl flex-col px-4 py-2">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={`rounded-md py-3 text-base font-medium text-body transition-colors hover:text-amber-700 dark:hover:text-amber-400 ${FOCUS_RING}`}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}
