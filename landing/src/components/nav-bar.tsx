import Image from 'next/image';
import Link from 'next/link';
import { ThemeToggle } from './theme-toggle';

export function NavBar() {
  return (
    <nav className="fixed left-0 right-0 top-0 z-50 border-b border-border/60 bg-canvas/80 shadow-sm backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-6">
        <Link href="/" className="flex items-center gap-2 group cursor-pointer">
          <div className="w-9 h-9 relative">
            <Image src="/logo.png" alt="KamehaDB" fill className="object-contain" />
          </div>
          <span className="font-bold text-ink text-lg">KamehaDB</span>
        </Link>
        <div className="flex items-center gap-3 md:gap-6">
          <Link
            href="/"
            className="hidden rounded-md text-sm font-medium text-body transition-colors hover:text-amber-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:hover:text-amber-400 sm:inline-flex"
          >
            Home
          </Link>
          <Link
            href="/changelog"
            className="hidden rounded-md text-sm font-medium text-body transition-colors hover:text-amber-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:hover:text-amber-400 sm:inline-flex"
          >
            Changelog
          </Link>
          <Link
            href="/team"
            className="hidden rounded-md text-sm font-medium text-body transition-colors hover:text-amber-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:hover:text-amber-400 sm:inline-flex"
          >
            Team
          </Link>
          <a
            href="https://github.com/asta-nguyen/kamehadb"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-[var(--shadow-warm-glow)] transition-all hover:-translate-y-0.5 hover:bg-amber-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
          >
            GitHub
          </a>
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
}
