'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ThemeToggle } from './theme-toggle';
import {
  Database,
  Sparkles,
  MessageSquare,
  Workflow,
  Star,
  Apple,
  Monitor,
  Laptop,
  Gift,
  Shield,
  Brain,
  Code2,
  History,
  LineChart,
  Activity,
  Search,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../lib/utils';
import { Compare } from './ui/compare';
import postgresql from 'thesvg/postgresql';
import mysql from 'thesvg/mysql';
import mariadb from 'thesvg/mariadb';
import sqlite from 'thesvg/sqlite';
import microsoftSqlServer from 'thesvg/microsoft-sql-server';
import oracle from 'thesvg/oracle';
import clickhouse from 'thesvg/clickhouse';
import duckdb from 'thesvg/duckdb';
import mongodb from 'thesvg/mongodb';
import redis from 'thesvg/redis';
import qdrant from 'thesvg/qdrant';

type HomeViewProps = {
  readonly githubStars: number | null;
};

const features: { icon: LucideIcon; title: string; description: string }[] = [
  {
    icon: Database,
    title: 'One workspace, 12 engines',
    description:
      'Relational, document, cache, vector, and ledger systems in a single desktop app. Browse schemas, collections, keyspaces, points, and accounts side by side.',
  },
  {
    icon: Sparkles,
    title: 'AI that knows your schema',
    description:
      'Describe what you want in plain English. The assistant reads your real DDL, indexes, and constraints to generate SQL, MongoDB pipelines, Redis commands, and Qdrant searches.',
  },
  {
    icon: Search,
    title: 'Global search — Ctrl+K',
    description:
      'Fuzzy-find any connection, table, column, or open tab. Jump into a query, a stats page, or the AI chat without leaving the keyboard.',
  },
  {
    icon: MessageSquare,
    title: 'Contextual AI chat',
    description:
      'Persistent history per connection, streamed responses, and a Run button to execute the SQL the assistant writes. Bring your own OpenAI, Ollama, or 9Router.',
  },
  {
    icon: Workflow,
    title: 'Schema timeline, diff & migration',
    description:
      'Capture snapshots on demand, compare schemas side by side with per-table change cards, and generate the DDL to migrate from one state to the next — without writing ALTER TABLE by hand.',
  },
  {
    icon: LineChart,
    title: 'Built-in charts',
    description:
      'Turn any query result or Mongo collection into bar, line, area, or pie charts. Histograms, aggregates, and time series without exporting to a notebook.',
  },
  {
    icon: History,
    title: 'Query history with favorites',
    description:
      'Normalized query history per connection, grouped by pattern with duration stats. Star the ones you reach for every day; reuse, fork, and rerun in one click.',
  },
  {
    icon: Activity,
    title: 'Engine-native tooling',
    description:
      'PostgreSQL stats, MongoDB explorer with chart view, Redis key browser, Qdrant 3D vector map, TigerBeetle accounts/transfers — purpose-built screens for each engine.',
  },
];

const whyKamehadb: {
  icon: LucideIcon;
  title: string;
  description: string;
  providers?: { name: string; color: string }[];
}[] = [
  {
    icon: Gift,
    title: '100% Free & Open Source',
    description: 'No subscriptions, no premium tiers, no telemetry. The full source is on GitHub under Apache-2.0.',
  },
  {
    icon: Shield,
    title: 'Local-First & Private',
    description:
      'Connections, credentials, query history, and chat logs stay on your machine. We have no servers — there is nowhere for your data to go.',
  },
  {
    icon: Brain,
    title: 'Bring Your Own AI',
    description:
      'OpenAI, Ollama (local + cloud), 9router — pick the model that fits your workflow, or skip AI entirely.',
    providers: [
      {
        name: 'OpenAI',
        color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
      },
      {
        name: 'Ollama Local',
        color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
      },
      {
        name: 'Ollama Cloud',
        color: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20',
      },
      {
        name: '9router',
        color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
      },
    ],
  },
  {
    icon: Code2,
    title: 'Open Standards',
    description:
      'Pure SQL, MongoDB aggregation pipelines, Redis protocol. No proprietary query language, no migration lock-in.',
  },
];

const marqueeEngines: { label: string; svg: { svg: string } | string | null }[] = [
  { label: 'PostgreSQL', svg: postgresql },
  { label: 'MySQL', svg: mysql },
  { label: 'MariaDB', svg: mariadb },
  { label: 'SQLite', svg: sqlite },
  { label: 'SQL Server', svg: microsoftSqlServer },
  { label: 'Oracle', svg: oracle },
  { label: 'ClickHouse', svg: clickhouse },
  { label: 'DuckDB', svg: duckdb },
  { label: 'MongoDB', svg: mongodb },
  { label: 'Redis', svg: redis },
  { label: 'Qdrant', svg: qdrant },
  { label: 'TigerBeetle', svg: '/images/tigerbeetle.svg' },
];

const engineByLabel = new Map(marqueeEngines.map((engine) => [engine.label, engine] as const));

const engineSwapTransition = {
  duration: 0.9,
  ease: 'easeInOut',
} as const;

function EngineCarousel() {
  const [labels, setLabels] = useState<string[]>(() => marqueeEngines.slice(0, 6).map((l) => l.label));

  useEffect(() => {
    // Drive each slot independently so six logos stay mounted at all times,
    // while each timed update swaps only the logo layer inside one fixed card.
    const timers: Set<ReturnType<typeof setTimeout>> = new Set();

    const cycle = (idx: number) => {
      const delay = 7000 + Math.random() * 4000;
      const timer = setTimeout(() => {
        timers.delete(timer);
        setLabels((prev) => {
          const visible = new Set(prev);
          const invisible = marqueeEngines.map((e) => e.label).filter((l) => !visible.has(l));
          const nextLabel = invisible[Math.floor(Math.random() * invisible.length)];
          const next = [...prev];
          next[idx] = nextLabel;
          return next;
        });
        cycle(idx);
      }, delay);
      timers.add(timer);
    };

    for (let i = 0; i < 6; i++) cycle(i);
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="flex flex-col items-center gap-2.5">
      {[0, 1].map((row) => (
        <div key={row} className="flex items-center justify-center gap-3">
          {labels.slice(row * 3, row * 3 + 3).map((label, i) => {
            const idx = row * 3 + i;
            const engine = engineByLabel.get(label);

            if (engine === undefined) {
              return null;
            }

            return (
              <div
                key={idx}
                className="relative flex items-center justify-center px-2 w-20 h-12 bg-white/80 border-slate-200/70 rounded-xl shadow-xs group backdrop-blur-xs border overflow-hidden dark:bg-surface-strong/80 dark:border-slate-700/60"
                title={engine.label}
              >
                {/* Gradient accent glow on hover */}
                <div className="absolute bg-linear-to-br rounded-xl opacity-0 inset-0 transition-opacity duration-500 from-amber-500/[0.03] to-rose-500/[0.03] group-hover:opacity-100" />
                {/* Bottom accent line */}
                <div className="absolute bottom-0 left-2 right-2 h-[1.5px] bg-linear-to-r rounded-full from-amber-400/0 via-amber-500/30 to-rose-500/0" />
                <div className="relative h-4 w-14 overflow-hidden">
                  <AnimatePresence initial={false} mode="sync">
                    <motion.div
                      key={label}
                      className="absolute flex items-center justify-center inset-0"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={engineSwapTransition}
                    >
                      <EngineLogo engine={engine} />
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function EngineLogo({ engine }: { engine: { label: string; svg: { svg: string } | string | null } }) {
  if (typeof engine.svg === 'string') {
    return (
      <Image
        src={engine.svg}
        alt={engine.label}
        width={48}
        height={16}
        className="h-4 w-auto max-w-full object-contain"
      />
    );
  }

  if (engine.svg) {
    return <BrandIcon icon={engine.svg} />;
  }

  return <span className="text-indigo-500 font-bold">TB</span>;
}

function BrandIcon({ icon, className }: { icon: { svg: string }; className?: string }) {
  return (
    <span
      // Give inline SVG logos a real width so `width="100%"` resolves to pixels
      // instead of collapsing the vector to 0px inside the carousel slot.
      className={cn('inline-flex h-4 w-12 max-w-full items-center justify-center overflow-hidden', className)}
      dangerouslySetInnerHTML={{
        __html: icon.svg
          .replace(/width='[^']*'/g, "width='100%'")
          .replace(/width="[^"]*"/g, 'width="100%"')
          .replace(/height='[^']*'/g, "height='100%'")
          .replace(/height="[^"]*"/g, 'height="100%"')
          .replace(
            /<svg/,
            '<svg style="width:100%;height:100%;max-width:100%;max-height:100%" preserveAspectRatio="xMidYMid meet"',
          ),
      }}
    />
  );
}

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0 },
};

const stagger = {
  visible: {
    transition: { staggerChildren: 0.1 },
  },
};

function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <motion.div
      className="mb-16 text-center"
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-80px' }}
      variants={stagger}
    >
      <motion.h2
        className="mb-4 text-4xl text-ink font-extrabold tracking-tight"
        variants={fadeUp}
        transition={{ duration: 0.5 }}
      >
        {title}
      </motion.h2>
      <motion.div
        className="mx-auto mb-4 w-16 h-1 bg-linear-to-r rounded-full from-amber-500 to-rose-500"
        variants={fadeUp}
        transition={{ duration: 0.5, delay: 0.15 }}
      />
      <motion.p className="mx-auto max-w-xl text-xl text-body" variants={fadeUp} transition={{ duration: 0.5 }}>
        {subtitle}
      </motion.p>
    </motion.div>
  );
}

const queries = [
  "SELECT name, SUM(amount) AS total FROM orders WHERE created_at > NOW() - INTERVAL '7 days' GROUP BY name ORDER BY total DESC;",
  'db.orders.aggregate([{ $match: { status: "shipped" } }, { $group: { _id: "$region", total: { $sum: "$amount" } } }])',
  'KEYS user:*\nSCARD user:42:notifications\nZREVRANGE leaderboard:weekly 0 9 WITHSCORES',
  'SELECT p.title, AVG(r.score) rating FROM products p JOIN reviews r ON r.product_id = p.id GROUP BY p.id HAVING COUNT(r.id) >= 5 ORDER BY rating DESC LIMIT 10;',
];

function TerminalTypewriter() {
  const [queryIndex, setQueryIndex] = useState(0);
  const [visibleChars, setVisibleChars] = useState(0);
  const done = visibleChars >= queries[queryIndex].length;

  useEffect(() => {
    if (!done) {
      const timeout = setTimeout(() => setVisibleChars((v) => v + 1), 12 + Math.random() * 20);
      return () => clearTimeout(timeout);
    } else {
      const timeout = setTimeout(() => {
        setQueryIndex((i) => (i + 1) % queries.length);
        setVisibleChars(0);
      }, 2500);
      return () => clearTimeout(timeout);
    }
  }, [done, queryIndex, visibleChars]);

  return (
    <div className="relative mx-auto w-full max-w-3xl group">
      <div className="absolute bg-linear-to-r rounded-2xl opacity-60 -inset-1 from-amber-500/20 via-rose-500/20 to-amber-500/20 blur-xl transition-opacity group-hover:opacity-80" />
      <div className="relative h-40 bg-[#0d0d14] border-[#27273a] rounded-xl shadow-2xl border overflow-hidden md:h-40">
        <div className="flex items-center px-4 py-2.5 bg-[#12121a] border-b border-[#27273a] rounded-t-xl gap-2">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 bg-rose-500/60 rounded-full" />
            <div className="w-3 h-3 bg-amber-500/60 rounded-full" />
            <div className="w-3 h-3 bg-emerald-500/60 rounded-full" />
          </div>
          <span className="flex items-center ml-3 text-xs text-slate-600 font-mono gap-2">
            <span className="flex items-center justify-center w-3.5 h-3.5 text-amber-400 font-bold bg-amber-500/20 rounded-sm">
              &#60;
            </span>
            query.sql
          </span>
        </div>
        <div className="p-4 text-xs font-mono leading-relaxed md:p-5 md:text-sm">
          <div className="flex items-center mb-2 text-muted text-xs gap-2 md:mb-2.5 md:text-xs">
            <span className="text-emerald-400 font-semibold">kamehadb</span>
            <span className="text-slate-600">@</span>
            <span className="text-amber-400 font-semibold">local</span>
            <span className="text-slate-600">:</span>
            <span className="text-muted">~</span>
            <span className="text-slate-600">$</span>
          </div>
          <pre className="text-body leading-relaxed whitespace-pre-wrap overflow-hidden">
            {queries[queryIndex].slice(0, visibleChars)}
            <span className="text-amber-400/90 font-mono animate-[blink_0.8s_step-end_infinite] select-none">
              &#9608;
            </span>
          </pre>
        </div>
      </div>
    </div>
  );
}

export default function HomeView({ githubStars }: HomeViewProps) {
  // Format star count: 9 → "9", 1200 → "1.2k"
  const formattedStars =
    githubStars !== null
      ? githubStars >= 1000
        ? `${(githubStars / 1000).toFixed(1).replace(/\.0$/, '')}k`
        : `${githubStars}`
      : null;

  return (
    <main id="content" className="min-h-screen font-sans bg-canvas antialiased">
      {/* Navigation */}
      <motion.nav
        className="fixed top-0 left-0 right-0 z-50 bg-canvas/70 border-b border-border/60 backdrop-blur-md before:absolute before:bottom-0 before:h-px before:bg-linear-to-r before:inset-x-0 before:from-transparent before:via-amber-500/30 before:to-transparent"
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        <div className="flex items-center justify-between px-4 py-4 mx-auto max-w-6xl md:px-6">
          <Link href="/" className="flex items-center gap-2 group cursor-pointer">
            <div className="relative w-9 h-9">
              <Image src="/logo.png" alt="KamehaDB" fill className="object-contain" />
            </div>
            <span className="text-slate-900 text-lg font-bold dark:text-slate-100">KamehaDB</span>
          </Link>
          <div className="flex items-center gap-4">
            <a
              href="#features"
              className="hidden text-body text-sm font-medium transition-colors sm:block hover:text-amber-600 dark:hover:text-amber-400"
            >
              Features
            </a>
            <a
              href="#install"
              className="hidden text-body text-sm font-medium transition-colors sm:block hover:text-amber-600 dark:hover:text-amber-400"
            >
              Install
            </a>
            <a
              href="https://github.com/asta-nguyen/kamehadb"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center px-4 py-2 text-white text-sm font-medium bg-amber-500 rounded-xl gap-2 transition-all hover:bg-amber-600 hover:shadow-lg hover:shadow-amber-500/25"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
              GitHub
            </a>
            <ThemeToggle />
          </div>
        </div>
      </motion.nav>

      {/* Hero Section */}
      <section className="relative pt-24 pb-16 px-4 overflow-hidden md:pt-32 md:pb-20 md:px-6">
        <div className="absolute bg-[size:64px_64px] inset-0" />
        <div className="absolute top-1/2 left-1/2 w-160 h-160 bg-linear-to-br rounded-full -translate-x-1/2 -translate-y-1/2 from-amber-500/10 via-rose-500/5 to-transparent blur-3xl pointer-events-none" />
        <div className="relative mx-auto max-w-6xl text-center">
          <motion.div
            className="flex flex-wrap items-center justify-center mb-8 gap-2"
            initial="hidden"
            animate="visible"
            variants={stagger}
          >
            <motion.div
              className="inline-flex items-center px-4 py-2 text-amber-600 text-sm font-medium bg-amber-50 rounded-full gap-2 dark:text-amber-400 dark:bg-amber-950/50"
              variants={fadeUp}
              transition={{ duration: 0.4 }}
            >
              <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
              12+ engines • SQL, document, cache, vector & ledger
            </motion.div>
            <motion.div
              className="inline-flex items-center px-4 py-2 text-emerald-600 text-sm font-medium bg-emerald-50 rounded-full gap-1.5 dark:text-emerald-400 dark:bg-emerald-950/50"
              variants={fadeUp}
              transition={{ duration: 0.4 }}
            >
              <Gift className="w-3.5 h-3.5" />
              100% Free & Open Source
            </motion.div>
          </motion.div>

          <motion.h1
            className="mb-6 text-3xl text-ink font-extrabold tracking-tight leading-tight sm:text-4xl md:text-5xl lg:text-6xl"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            Your databases, in one{' '}
            <span className="text-transparent bg-clip-text from-amber-500 to-rose-500">local-first workspace</span>
          </motion.h1>

          <motion.p
            className="mx-auto mb-6 max-w-2xl text-xl text-body leading-relaxed"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            KamehaDB is a cross-platform desktop GUI for SQL, document, cache, vector, and ledger systems — built with
            AI in, not bolted on. Runs entirely on your machine.
          </motion.p>
          <motion.div
            className="flex items-center justify-center mb-10 gap-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.6 }}
          >
            <div className="inline-flex items-center px-3 py-1 text-xs text-muted font-medium bg-surface-strong/80 border-border/50 rounded-full gap-1.5 backdrop-blur-xs border">
              <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
              <span className="tracking-tight">
                {formattedStars !== null ? `${formattedStars} Stars` : 'Stars on GitHub'}
              </span>
            </div>
          </motion.div>

          <motion.div
            className="flex flex-col items-center justify-center gap-4 sm:flex-row"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
          >
            <a
              href="#install"
              className="px-8 py-4 text-white font-semibold bg-amber-500 rounded-xl transition-all hover:bg-amber-600 hover:shadow-lg hover:shadow-amber-500/25 hover:scale-105"
            >
              Get Started
            </a>
            <a
              href="#features"
              className="px-8 py-4 text-slate-700 font-medium border-slate-300 rounded-xl border transition-all hover:bg-surface-soft hover:border-amber-300 dark:text-body dark:border-slate-700 dark:hover:bg-surface-strong dark:hover:border-amber-500"
            >
              Learn More
            </a>
          </motion.div>
          <motion.div
            className="flex items-center justify-center mt-8 gap-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.7 }}
          >
            {[
              { icon: Apple, label: 'macOS' },
              { icon: Monitor, label: 'Windows' },
              { icon: Laptop, label: 'Linux' },
            ].map((os) => (
              <div
                key={os.label}
                className="flex items-center px-3 py-1 text-xs text-muted font-medium bg-surface-soft/50 border-border/30 rounded-md gap-1.5 border transition-colors hover:text-body hover:border-amber-500/30"
              >
                <os.icon className="w-3 h-3" />
                {os.label}
              </div>
            ))}
          </motion.div>

          {/* Terminal Window */}
          <motion.div
            className="mt-10"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.6 }}
          >
            <TerminalTypewriter />
          </motion.div>

          {/* Supported Engines */}
          <motion.div
            className="relative pt-0 mt-16"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
          >
            {/* Gradient accent divider */}
            <div className="absolute left-1/2 top-0 w-24 h-[1.5px] bg-linear-to-r -translate-x-1/2 from-amber-400/0 via-amber-500 to-rose-500/0" />

            <motion.div
              className="flex items-center justify-center mb-6 gap-3"
              variants={fadeUp}
              transition={{ duration: 0.4 }}
            >
              <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
              <span className="text-sm text-muted font-medium">
                12+ engines — <span className="text-body">SQL, document, cache, vector &amp; ledger</span>
              </span>
            </motion.div>

            <motion.div className="mx-auto max-w-3xl" variants={fadeUp} transition={{ duration: 0.5 }}>
              <EngineCarousel />
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Demo/Visual Section */}
      <section className="relative py-16 px-4 bg-surface-soft overflow-hidden md:py-20 md:px-6">
        <div className="absolute bg-[radial-gradient(ellipse_at_center,rgba(245,158,11,0.04)_0%,transparent_70%)] inset-0" />
        <div className="relative mx-auto max-w-6xl">
          <motion.div
            className="relative"
            initial={{ opacity: 0, y: 40, scale: 0.97 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
          >
            <div className="absolute bg-linear-to-r rounded-3xl opacity-60 -inset-1 from-amber-500/10 via-rose-500/10 to-amber-500/10 blur-xl" />
            <div className="relative p-2 bg-surface-strong rounded-3xl border-slate-700/50 shadow-2xl shadow-amber-500/10 border">
              <div className="flex items-center px-4 py-2 gap-2">
                <div className="w-3 h-3 bg-rose-500/80 rounded-full" />
                <div className="w-3 h-3 bg-amber-500/80 rounded-full" />
                <div className="w-3 h-3 bg-green-500/80 rounded-full" />
              </div>
              <div className="relative bg-surface-strong rounded-2xl overflow-hidden">
                <div className="absolute bg-linear-to-br inset-0 from-amber-900/30 to-slate-800" />
                <video
                  src="https://kamehadb.s3.ap-southeast-2.amazonaws.com/demo-kamehadb.mp4"
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="relative w-full h-auto"
                />
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Why KamehaDB - Value Props */}
      <section className="py-16 px-4 md:py-24 md:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionHeading title="Free. Local. Yours." subtitle="Four principles. No asterisks." />

          <div className="grid gap-5 md:grid-cols-2">
            {whyKamehadb.map((item, index) => (
              <motion.div
                key={item.title}
                className="relative p-6 bg-white border-slate-200 rounded-2xl group border overflow-hidden transition-all duration-500 md:p-8 hover:border-amber-500/30 hover:shadow-2xl hover:shadow-amber-500/5 dark:bg-surface-strong/40 dark:border-[#27273a] dark:hover:shadow-amber-500/10"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-80px' }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
              >
                <div className="absolute left-0 top-0 w-1 h-full bg-linear-to-b opacity-0 from-amber-500 to-rose-500 transition-opacity duration-500 group-hover:opacity-100" />
                <div className="absolute w-40 h-40 bg-linear-to-br rounded-full -top-20 -right-20 from-amber-500/5 to-rose-500/5 blur-2xl transition-all duration-700 group-hover:from-amber-500/10 group-hover:to-rose-500/10" />

                <div className="relative">
                  <motion.div
                    className="flex items-center justify-center mb-5 w-12 h-12 bg-linear-to-br rounded-xl shadow-lg shadow-amber-500/20 from-amber-500 to-rose-500"
                    whileHover={{ rotate: 3, scale: 1.08 }}
                    transition={{ type: 'spring', stiffness: 300 }}
                  >
                    <item.icon className="w-6 h-6 text-white" />
                  </motion.div>
                  <h3 className="mb-2 text-lg text-ink font-bold">{item.title}</h3>
                  <p className="text-sm text-body leading-relaxed">{item.description}</p>
                  {item.providers && (
                    <div className="flex flex-wrap mt-4 gap-1.5">
                      {item.providers.map((provider) => (
                        <span
                          key={provider.name}
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${provider.color}`}
                        >
                          {provider.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* AI Query Generation */}
      <section className="relative py-16 px-4 overflow-hidden md:py-24 md:px-6">
        <div className="absolute bg-[radial-gradient(ellipse_at_center,rgba(245,158,11,0.07)_0%,transparent_70%)] inset-0" />
        <div className="relative mx-auto max-w-6xl">
          <SectionHeading
            title="Just say what you need"
            subtitle="Describe your intent in plain English. KamehaDB writes the SQL for you."
          />
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
            className="flex items-center justify-center w-full"
          >
            <div className="relative w-full max-w-6xl">
              <div className="absolute bg-linear-to-r rounded-3xl opacity-60 -inset-1 from-amber-500/20 via-rose-500/20 to-amber-500/20 blur-xl" />
              <div className="relative bg-surface-strong border-slate-700/50 rounded-3xl shadow-2xl shadow-amber-500/10 border overflow-hidden">
                <div className="relative">
                  <div className="absolute top-3 left-4 z-[22]">
                    <span className="px-3 py-1 text-xs text-body font-medium bg-surface-strong/80 rounded-full border-slate-700/50 backdrop-blur-xs border">
                      You asks
                    </span>
                  </div>
                  <div className="absolute top-3 right-4 z-[22]">
                    <span className="px-3 py-1 text-xs text-amber-300 font-medium bg-amber-950/60 rounded-full border-amber-500/30 backdrop-blur-xs border">
                      KamehaDB writes
                    </span>
                  </div>
                  <Compare
                    firstImage="/images/chat-panel.png"
                    secondImage="/images/sql-panel.png"
                    slideMode="drag"
                    initialSliderPercentage={50}
                    showHandlebar
                    className="w-full aspect-11/5"
                    firstImageClassName="rounded-none"
                    secondImageClassname="rounded-none"
                  />
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-16 px-4 md:py-24 md:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionHeading
            title="Everything you need"
            subtitle="Powerful features to streamline your database workflow"
          />

          <div className="grid gap-5 md:grid-cols-2">
            {features.map((feature, index) => (
              <motion.div
                key={index}
                className="relative p-6 bg-white border-slate-200 rounded-2xl group border overflow-hidden transition-all duration-500 md:p-8 hover:border-amber-500/30 hover:shadow-2xl hover:shadow-amber-500/5 dark:bg-surface-strong/40 dark:border-[#27273a] dark:hover:shadow-amber-500/10"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-80px' }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
              >
                {/* Animated gradient bar on left */}
                <div className="absolute left-0 top-0 w-1 h-full bg-linear-to-b opacity-0 from-amber-500 to-rose-500 transition-opacity duration-500 group-hover:opacity-100" />

                {/* Subtle corner glow */}
                <div className="absolute w-40 h-40 bg-linear-to-br rounded-full -top-20 -right-20 from-amber-500/5 to-rose-500/5 blur-2xl transition-all duration-700 group-hover:from-amber-500/10 group-hover:to-rose-500/10" />

                <div className="relative">
                  <motion.div
                    className="flex items-center justify-center mb-5 w-12 h-12 bg-linear-to-br rounded-xl shadow-lg shadow-amber-500/20 from-amber-500 to-rose-500"
                    whileHover={{ rotate: 3, scale: 1.08 }}
                    transition={{ type: 'spring', stiffness: 300 }}
                  >
                    <feature.icon className="w-6 h-6 text-white" />
                  </motion.div>
                  <h3 className="mb-2 text-lg text-ink font-bold">{feature.title}</h3>
                  <p className="text-sm text-body leading-relaxed">{feature.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Installation Section */}
      <section id="install" className="py-16 px-4 bg-surface-soft md:py-24 md:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="grid items-center gap-12 md:grid-cols-2">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-80px' }}
              variants={stagger}
            >
              <motion.h2
                className="mb-6 text-4xl text-ink font-extrabold tracking-tight"
                variants={fadeUp}
                transition={{ duration: 0.5 }}
              >
                Get started in minutes
              </motion.h2>
              <motion.p
                className="mb-8 text-xl text-body leading-relaxed"
                variants={fadeUp}
                transition={{ duration: 0.5 }}
              >
                Install KamehaDB and connect to your first database in under 2 minutes. Works on macOS, Windows, and
                Linux.
              </motion.p>
              <div className="space-y-4">
                {[
                  { step: '1', title: 'Download the app', desc: 'Available for macOS, Windows, and Linux' },
                  {
                    step: '2',
                    title: 'Add your connection',
                    desc: 'PostgreSQL, MySQL, MariaDB, SQLite, SQL Server, Oracle, ClickHouse, DuckDB, MongoDB, Redis, Qdrant, or TigerBeetle',
                  },
                  { step: '3', title: 'Start exploring', desc: 'Browse schemas, run queries, and chat with AI' },
                ].map((item, i) => (
                  <motion.div
                    key={i}
                    className="flex items-start gap-4"
                    variants={fadeUp}
                    transition={{ duration: 0.4 }}
                  >
                    <div className="flex items-center justify-center w-8 h-8 text-white text-sm font-bold bg-amber-500 rounded-full shrink-0">
                      {item.step}
                    </div>
                    <div>
                      <h4 className="text-ink font-semibold">{item.title}</h4>
                      <p className="text-body text-sm">{item.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            <motion.div
              className="relative group"
              initial={{ opacity: 0, x: 40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            >
              <div className="absolute bg-linear-to-r rounded-2xl opacity-40 -inset-0.5 from-amber-500/10 via-rose-500/10 to-amber-500/10 blur-sm transition-opacity group-hover:opacity-70" />
              <div className="relative p-6 bg-[#0d0d14] border-[#27273a] rounded-2xl shadow-2xl border">
                <div className="flex items-center mb-4 gap-2">
                  <div className="w-3 h-3 bg-rose-500/80 rounded-full" />
                  <div className="w-3 h-3 bg-amber-500/80 rounded-full" />
                  <div className="w-3 h-3 bg-emerald-500/80 rounded-full" />
                </div>
                <div className="text-sm font-mono space-y-2">
                  <motion.div
                    className="text-muted"
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.3 }}
                  >
                    # Clone the repository
                  </motion.div>
                  <motion.div
                    className="text-emerald-400"
                    initial={{ opacity: 0, x: -10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.5 }}
                  >
                    git clone https://github.com/asta-nguyen/kamehadb.git
                  </motion.div>
                  <motion.div
                    className="mt-4 text-muted"
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.7 }}
                  >
                    # Install dependencies and run
                  </motion.div>
                  <motion.div
                    className="text-emerald-400"
                    initial={{ opacity: 0, x: -10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.9 }}
                  >
                    cd kamehadb
                  </motion.div>
                  <motion.div
                    className="text-emerald-400"
                    initial={{ opacity: 0, x: -10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 1.1 }}
                  >
                    pnpm install && pnpm dev
                  </motion.div>

                  <motion.div
                    className="mt-4 text-muted"
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 1.3 }}
                  >
                    # Build you app in your OS
                  </motion.div>

                  <motion.div
                    className="text-emerald-400"
                    initial={{ opacity: 0, x: -10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 1.5 }}
                  >
                    pnpm tauri build --target aarch64-apple-darwin
                  </motion.div>

                  <motion.div
                    className="mt-4 text-muted"
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 1.8 }}
                  >
                    # Build you app in your Windows
                  </motion.div>

                  <motion.div
                    className="text-emerald-400"
                    initial={{ opacity: 0, x: -10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 1.9 }}
                  >
                    pnpm tauri build --target x86_64-pc-windows-msvc
                  </motion.div>

                  <motion.div
                    className="mt-4 text-muted"
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 2.0 }}
                  >
                    # Build you app in your Linux
                  </motion.div>

                  <motion.div
                    className="text-emerald-400"
                    initial={{ opacity: 0, x: -10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 2.1 }}
                  >
                    pnpm tauri build --target x86_64-unknown-linux-gnu
                  </motion.div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative py-16 px-4 overflow-hidden md:py-24 md:px-6">
        <div className="absolute bg-linear-to-b inset-0 from-transparent via-amber-500/5 to-transparent" />
        <div className="absolute top-1/2 left-1/2 w-128 h-128 bg-linear-to-br rounded-full -translate-x-1/2 -translate-y-1/2 from-amber-500/8 via-rose-500/5 to-transparent blur-3xl pointer-events-none" />
        <motion.div
          className="relative p-6 mx-auto max-w-4xl text-center bg-white/50 rounded-3xl border-slate-200/60 backdrop-blur-xs border md:p-12 dark:bg-surface-strong/50 dark:border-slate-700/50"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={stagger}
        >
          <motion.h2
            className="mb-6 text-4xl text-ink font-extrabold tracking-tight"
            variants={fadeUp}
            transition={{ duration: 0.5 }}
          >
            One app for every database you run
          </motion.h2>
          <motion.p className="mb-10 text-xl text-body" variants={fadeUp} transition={{ duration: 0.5 }}>
            Free, open source, and local-first. No telemetry, no cloud proxy — your data stays on your machine.
          </motion.p>
          <motion.div variants={fadeUp} transition={{ duration: 0.5 }}>
            <motion.a
              href="https://github.com/asta-nguyen/kamehadb/releases"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-8 py-4 text-white font-semibold bg-amber-500 rounded-xl gap-2 transition-colors hover:bg-amber-600 hover:shadow-lg hover:shadow-amber-500/25"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.98 }}
            >
              Download for free
            </motion.a>
          </motion.div>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-border md:py-12 md:px-6">
        <div className="flex flex-col items-center justify-between mx-auto max-w-6xl gap-6 md:flex-row">
          <Link href="/" className="flex items-center gap-2">
            <div className="relative w-9 h-9">
              <Image src="/logo.png" alt="KamehaDB" fill className="object-contain" />
            </div>
            <span className="text-ink font-bold">KamehaDB</span>
          </Link>
          <div className="flex items-center text-sm text-muted gap-6">
            <a
              href="https://github.com/asta-nguyen/kamehadb"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-amber-600 dark:hover:text-amber-400"
            >
              GitHub
            </a>
            <Link href="/changelog" className="transition-colors hover:text-amber-600 dark:hover:text-amber-400">
              Changelog
            </Link>
            <a
              href="https://github.com/asta-nguyen/kamehadb/releases"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-amber-600 dark:hover:text-amber-400"
            >
              Releases
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
