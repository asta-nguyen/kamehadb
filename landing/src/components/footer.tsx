import Image from 'next/image';
import Link from 'next/link';

export function Footer() {
  return (
    <footer className="border-t border-border py-8 md:py-12 px-4 md:px-6 mt-auto">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-9 h-9 relative">
            <Image src="/logo.png" alt="KamehaDB" fill className="object-contain" />
          </div>
          <span className="font-bold text-ink">KamehaDB</span>
        </Link>
        <div className="flex items-center gap-6 text-sm text-muted">
          <a
            href="https://github.com/asta-nguyen/kamehadb"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
          >
            GitHub
          </a>
          <Link href="/changelog" className="hover:text-amber-600 dark:hover:text-amber-400 transition-colors">
            Changelog
          </Link>
          <Link href="/team" className="hover:text-amber-600 dark:hover:text-amber-400 transition-colors">
            Team
          </Link>
          <Link href="/video" className="hover:text-amber-600 dark:hover:text-amber-400 transition-colors">
            Video Demo
          </Link>
          <a
            href="https://github.com/asta-nguyen/kamehadb/releases"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
          >
            Releases
          </a>
        </div>
      </div>
    </footer>
  );
}
