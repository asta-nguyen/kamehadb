'use client';

import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  Apple,
  ArrowRight,
  Brain,
  Cable,
  Code2,
  Database,
  Download,
  Gift,
  History,
  Laptop,
  LineChart,
  MessageSquare,
  Monitor,
  Search,
  Shield,
  Sparkles,
  Star,
  Workflow,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import clickhouse from 'thesvg/clickhouse';
import duckdb from 'thesvg/duckdb';
import mariadb from 'thesvg/mariadb';
import microsoftSqlServer from 'thesvg/microsoft-sql-server';
import mongodb from 'thesvg/mongodb';
import mysql from 'thesvg/mysql';
import oracle from 'thesvg/oracle';
import postgresql from 'thesvg/postgresql';
import redis from 'thesvg/redis';
import sqlite from 'thesvg/sqlite';
import { RELEASES_URL } from '@/lib/links';
import { useMediaQuery } from '@/lib/use-media-query';
import { EngineMatrix } from './engine-matrix';
import { SchemaGraph3D } from './schema-graph-3d';
import { BrandIcon } from './ui/brand-icon';

const HeroCanvas = dynamic(() => import('./hero-canvas'), { ssr: false });

type HomeViewProps = {
  readonly githubStars: number | null;
};

const features: { icon: LucideIcon; title: string; description: string }[] = [
  {
    icon: Database,
    title: 'One workspace, 10 engines',
    description:
      'Relational, document, and cache systems in a single desktop app. Browse schemas, collections, and keyspaces side by side.',
  },
  {
    icon: Sparkles,
    title: 'AI that knows your schema',
    description:
      'Describe what you want in plain English. The assistant reads your real DDL, indexes, and constraints to generate SQL, MongoDB pipelines, and Redis commands.',
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
      'Persistent history per connection, streamed responses, and generated SQL shown for review so you run it yourself in the editor. Bring your own OpenAI, Ollama, 9Router, DeepSeek, or Gemini.',
  },
  {
    icon: Cable,
    title: 'Read-only MCP server',
    description:
      'Point Codex, Claude Code, Devin CLI, or OpenCode at a loopback MCP endpoint. KamehaDB provisions a database-scoped read-only account and stores its credential in an encrypted local vault (OS keychain, with an owner-only key file fallback).',
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
      'PostgreSQL stats, MongoDB explorer with chart view, Redis key browser — purpose-built screens for each engine.',
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
      'Connections, credentials, query history, and chat logs stay on your machine, encrypted at rest. We have no servers. Remote AI is opt-in: the provider you choose receives only the conversation and schema context you send.',
  },
  {
    icon: Brain,
    title: 'Bring Your Own AI',
    description:
      'OpenAI, Ollama (local + cloud), 9router, DeepSeek, Gemini — pick the model that fits your workflow, or skip AI entirely.',
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
      {
        name: 'DeepSeek',
        color: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
      },
      {
        name: 'Gemini',
        color: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20',
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
                className="group relative flex items-center justify-center w-20 h-12 px-2 bg-white/80 dark:bg-surface-strong/80 backdrop-blur-sm border border-slate-200/70 dark:border-slate-700/60 rounded-xl shadow-sm overflow-hidden"
                title={engine.label}
              >
                {/* Gradient accent glow on hover */}
                <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br from-amber-500/[0.03] to-rose-500/[0.03]" />
                {/* Bottom accent line */}
                <div className="absolute bottom-0 left-2 right-2 h-[1.5px] rounded-full bg-gradient-to-r from-amber-400/0 via-amber-500/30 to-rose-500/0" />
                <div className="relative h-4 w-14 overflow-hidden">
                  <AnimatePresence initial={false} mode="sync">
                    <motion.div
                      key={label}
                      className="absolute inset-0 flex items-center justify-center"
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
    return <BrandIcon icon={engine.svg} className="h-4 w-12 max-w-full" />;
  }

  return <span className="text-[9px] font-bold text-indigo-500">TB</span>;
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
      className="text-center mb-16"
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-80px' }}
      variants={stagger}
    >
      <motion.h2
        className="text-4xl font-extrabold text-ink tracking-tight mb-4"
        variants={fadeUp}
        transition={{ duration: 0.5 }}
      >
        {title}
      </motion.h2>
      <motion.div
        className="mx-auto w-16 h-1 bg-gradient-to-r from-amber-500 to-rose-500 rounded-full mb-4"
        variants={fadeUp}
        transition={{ duration: 0.5, delay: 0.15 }}
      />
      <motion.p className="text-xl text-body max-w-xl mx-auto" variants={fadeUp} transition={{ duration: 0.5 }}>
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
  const reduceMotion = useReducedMotion();
  const done = visibleChars >= queries[queryIndex].length;

  useEffect(() => {
    // Reduced motion: no typing loop, the first query is shown in full instead.
    if (reduceMotion) return;
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
  }, [done, queryIndex, visibleChars, reduceMotion]);

  return (
    <div className="relative w-full max-w-3xl mx-auto group text-left">
      <div className="absolute -inset-1 bg-gradient-to-r from-amber-500/20 via-rose-500/20 to-amber-500/20 rounded-2xl blur-xl opacity-60 group-hover:opacity-80 transition-opacity" />
      <div className="relative bg-[#0d0d14] border border-[#27273a] rounded-xl shadow-2xl h-48 md:h-40 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 bg-[#12121a] border-b border-[#27273a] rounded-t-xl">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-rose-500/60" />
            <div className="w-3 h-3 rounded-full bg-amber-500/60" />
            <div className="w-3 h-3 rounded-full bg-emerald-500/60" />
          </div>
          <span className="text-xs text-slate-400 ml-3 font-mono flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded bg-amber-500/20 flex items-center justify-center text-[9px] text-amber-400 font-bold">
              &#60;
            </span>
            query.sql
          </span>
        </div>
        <div className="p-4 md:p-5 font-mono text-xs md:text-sm leading-relaxed">
          <div className="flex items-center gap-2 text-slate-400 mb-2 md:mb-2.5 text-[11px] md:text-xs">
            <span className="text-emerald-400 font-semibold">kamehadb</span>
            <span className="text-slate-600">@</span>
            <span className="text-amber-400 font-semibold">local</span>
            <span className="text-slate-600">:</span>
            <span className="text-slate-400">~</span>
            <span className="text-slate-600">$</span>
          </div>
          <pre className="text-slate-200 whitespace-pre-wrap leading-relaxed overflow-hidden">
            {reduceMotion ? queries[0] : queries[queryIndex].slice(0, visibleChars)}
            <span className="text-amber-400/90 animate-[blink_0.8s_step-end_infinite] font-mono select-none">
              &#9608;
            </span>
          </pre>
        </div>
      </div>
    </div>
  );
}

// Plays the 19 MB demo only while it is on screen and never preloads it, so
// visitors who do not scroll here (or who prefer reduced motion) never pay for it.
function DemoVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const video = videoRef.current;
    if (!video || reduceMotion) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        // play() rejects when autoplay is blocked; the poster simply stays visible then.
        if (entry.isIntersecting) video.play().catch(() => {});
        else video.pause();
      },
      { threshold: 0.25 },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [reduceMotion]);

  return (
    <video
      ref={videoRef}
      src="/kamehadb-demo.mp4"
      poster="/images/demo-poster.jpg"
      preload="none"
      loop
      muted
      playsInline
      controls={Boolean(reduceMotion)}
      aria-label="KamehaDB product demo"
      className="w-full h-auto relative"
    />
  );
}

// One half of the "ask -> SQL" story. The source PNGs are pre-cropped to their
// content, so the image can fill the tile and stay legible on a phone.
function AiPanel({
  label,
  labelClassName,
  src,
  alt,
}: {
  label: string;
  labelClassName: string;
  src: string;
  alt: string;
}) {
  return (
    <figure className="min-w-0">
      <figcaption className={`mb-3 inline-block rounded-full border px-3 py-1 text-xs font-medium ${labelClassName}`}>
        {label}
      </figcaption>
      <div className="aspect-[940/900] overflow-hidden rounded-2xl border border-slate-700/50 bg-[#1f1d2b]">
        <Image
          src={src}
          alt={alt}
          width={940}
          height={900}
          sizes="(min-width: 768px) 520px, 92vw"
          className="h-auto w-full"
        />
      </div>
    </figure>
  );
}

export default function HomeView({ githubStars }: HomeViewProps) {
  // The 3D hero is decoration: skip its three.js bundle on phones and for reduced-motion users.
  const reduceMotion = useReducedMotion();
  const isWide = useMediaQuery('(min-width: 768px)');
  const showCanvas = isWide && !reduceMotion;

  // Format star count: 9 → "9", 1200 → "1.2k"
  const formattedStars =
    githubStars !== null
      ? githubStars >= 1000
        ? `${(githubStars / 1000).toFixed(1).replace(/\.0$/, '')}k`
        : `${githubStars}`
      : null;

  return (
    <main id="content" className="min-h-screen overflow-x-clip bg-canvas font-sans antialiased">
      {/* Hero Section */}
      <section className="relative pt-24 md:pt-32 pb-16 md:pb-20 px-4 md:px-6 overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(245,158,11,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(245,158,11,0.06)_1px,transparent_1px)] bg-[size:64px_64px]" />
        {/* Fade the 3D scene out behind the headline column so orbiting icons never cross the text. */}
        {showCanvas && (
          <div className="absolute inset-0 [mask-image:radial-gradient(ellipse_55%_50%_at_50%_38%,transparent_30%,#000_100%)]">
            <HeroCanvas />
          </div>
        )}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-160 h-160 bg-gradient-to-br from-amber-500/10 via-rose-500/5 to-transparent rounded-full blur-3xl pointer-events-none" />
        <div className="max-w-6xl mx-auto text-center relative" style={{ zIndex: 1 }}>
          <motion.div
            className="flex flex-wrap items-center justify-center gap-2 mb-8"
            initial="hidden"
            animate="visible"
            variants={stagger}
          >
            <motion.div
              className="inline-flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 rounded-full text-sm font-medium"
              variants={fadeUp}
              transition={{ duration: 0.4 }}
            >
              <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
              10 engines • SQL, document & cache
            </motion.div>
            <motion.div
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 rounded-full text-sm font-medium"
              variants={fadeUp}
              transition={{ duration: 0.4 }}
            >
              <Gift className="w-3.5 h-3.5" />
              100% Free & Open Source
            </motion.div>
          </motion.div>

          <motion.h1
            className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold text-ink tracking-tight mb-6 leading-tight text-balance"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            Your databases, in one {/* amber-600 start: amber-500 text on white is only 2.15:1 at this size. */}
            <span className="bg-gradient-to-r from-amber-600 to-rose-500 dark:from-amber-500 bg-clip-text text-transparent">
              local-first workspace
            </span>
          </motion.h1>

          <motion.p
            className="text-xl text-body max-w-2xl mx-auto mb-6 leading-relaxed"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            KamehaDB is a cross-platform desktop GUI for SQL, document, and cache systems — built with AI in, not bolted
            on. Runs locally on your machine, with remote AI providers optional.
          </motion.p>
          <motion.div
            className="flex items-center justify-center gap-2 mb-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.6 }}
          >
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-surface-strong/80 backdrop-blur-sm border border-border/50 rounded-full text-xs font-medium text-muted">
              <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
              <span className="tracking-tight">
                {formattedStars !== null ? `${formattedStars} Stars` : 'Stars on GitHub'}
              </span>
            </div>
          </motion.div>

          <motion.div
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
          >
            <a
              href={RELEASES_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full sm:w-auto items-center justify-center gap-2 px-8 py-4 bg-amber-500 hover:bg-amber-600 text-zinc-950 font-semibold rounded-xl transition-all hover:shadow-lg hover:shadow-amber-500/25 hover:scale-105"
            >
              <Download className="w-5 h-5" />
              Download for free
            </a>
            <a
              href="#features"
              className="w-full sm:w-auto text-center px-8 py-4 border border-slate-300 dark:border-slate-700 hover:border-amber-300 dark:hover:border-amber-500 text-slate-700 dark:text-body font-medium rounded-xl transition-all hover:bg-surface-soft dark:hover:bg-surface-strong"
            >
              See features
            </a>
          </motion.div>
          <motion.div
            className="flex items-center justify-center gap-4 mt-8"
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
                className="flex items-center gap-1.5 px-3 py-1 bg-surface-soft/50 border border-border/30 rounded-md text-xs font-medium text-muted transition-colors hover:border-amber-500/30 hover:text-body"
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
            className="mt-16 pt-0 relative"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
          >
            {/* Gradient accent divider */}
            <div className="absolute left-1/2 -translate-x-1/2 top-0 w-24 h-[1.5px] bg-gradient-to-r from-amber-400/0 via-amber-500 to-rose-500/0" />

            <motion.div
              className="flex items-center justify-center gap-3 mb-6"
              variants={fadeUp}
              transition={{ duration: 0.4 }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              <span className="text-sm font-medium text-muted">
                Works with <span className="text-body">PostgreSQL, MySQL, MongoDB, Redis and more</span>
              </span>
            </motion.div>

            <motion.div className="max-w-3xl mx-auto" variants={fadeUp} transition={{ duration: 0.5 }}>
              <EngineCarousel />
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Demo/Visual Section */}
      <section className="relative py-16 md:py-20 px-4 md:px-6 bg-surface-soft overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(245,158,11,0.04)_0%,transparent_70%)]" />
        <div className="max-w-6xl mx-auto relative">
          <motion.div
            className="relative"
            initial={{ opacity: 0, y: 40, scale: 0.97 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
          >
            <div className="absolute -inset-1 bg-gradient-to-r from-amber-500/10 via-rose-500/10 to-amber-500/10 rounded-3xl blur-xl opacity-60" />
            <div className="bg-surface-strong rounded-3xl p-2 shadow-2xl shadow-amber-500/10 relative border border-slate-700/50">
              <div className="flex items-center gap-2 px-4 py-2">
                <div className="w-3 h-3 rounded-full bg-rose-500/80" />
                <div className="w-3 h-3 rounded-full bg-amber-500/80" />
                <div className="w-3 h-3 rounded-full bg-green-500/80" />
              </div>
              <div className="bg-surface-strong rounded-2xl overflow-hidden relative">
                <div className="absolute inset-0 bg-gradient-to-br from-amber-900/30 to-slate-800" />
                <DemoVideo />
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Why KamehaDB - Value Props */}
      <section className="py-16 md:py-24 px-4 md:px-6">
        <div className="max-w-6xl mx-auto">
          <SectionHeading title="Free. Local. Yours." subtitle="Four principles. No asterisks." />

          <div className="grid md:grid-cols-2 gap-5">
            {whyKamehadb.map((item, index) => (
              <motion.div
                key={item.title}
                className="group relative bg-white dark:bg-surface-strong/40 border border-slate-200 dark:border-[#27273a] rounded-2xl p-6 md:p-8 overflow-hidden transition-all duration-500 hover:border-amber-500/30 hover:shadow-2xl hover:shadow-amber-500/5 dark:hover:shadow-amber-500/10"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-80px' }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
              >
                <div className="absolute left-0 top-0 w-1 h-full bg-gradient-to-b from-amber-500 to-rose-500 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="absolute -top-20 -right-20 w-40 h-40 bg-gradient-to-br from-amber-500/5 to-rose-500/5 rounded-full blur-2xl group-hover:from-amber-500/10 group-hover:to-rose-500/10 transition-all duration-700" />

                <div className="relative">
                  <motion.div
                    className="w-12 h-12 bg-gradient-to-br from-amber-500 to-rose-500 rounded-xl flex items-center justify-center mb-5 shadow-lg shadow-amber-500/20"
                    whileHover={{ rotate: 3, scale: 1.08 }}
                    transition={{ type: 'spring', stiffness: 300 }}
                  >
                    <item.icon className="w-6 h-6 text-white" />
                  </motion.div>
                  <h3 className="text-lg font-bold text-ink mb-2">{item.title}</h3>
                  <p className="text-sm text-body leading-relaxed">{item.description}</p>
                  {item.providers && (
                    <div className="flex flex-wrap gap-1.5 mt-4">
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

      {/* Engine Matrix */}
      <section className="py-16 md:py-24 px-4 md:px-6 bg-surface-soft">
        <div className="max-w-6xl mx-auto">
          <SectionHeading
            title="Every engine, one workspace"
            subtitle="10 databases — SQL, document, and cache — with feature matrices and Docker snippets"
          />
          <EngineMatrix />
        </div>
      </section>

      {/* AI Query Generation */}
      <section className="relative py-16 md:py-24 px-4 md:px-6 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(245,158,11,0.07)_0%,transparent_70%)]" />
        <div className="max-w-6xl mx-auto relative">
          <SectionHeading
            title="Just say what you need"
            subtitle="Describe your intent in plain English. KamehaDB writes the SQL for you."
          />
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
            className="w-full flex items-center justify-center"
          >
            <div className="relative w-full max-w-6xl">
              <div className="absolute -inset-1 bg-gradient-to-r from-amber-500/20 via-rose-500/20 to-amber-500/20 rounded-3xl blur-xl opacity-60" />
              <div className="relative shadow-2xl shadow-amber-500/10 border border-slate-700/50 bg-surface-strong rounded-3xl p-4 md:p-6">
                {/* Side by side (stacked on phones): a wipe slider cut the chat bubble and the SQL in half at its default position. */}
                <div className="grid items-center gap-4 md:grid-cols-[1fr_auto_1fr] md:gap-6">
                  <AiPanel
                    label="You ask"
                    labelClassName="text-body bg-surface-strong/80 border-slate-700/50"
                    src="/images/chat-panel.png"
                    alt="KamehaDB AI chat: the user asks for all users who signed up last month, ordered at least once and have a subscription plan, with their total spending."
                  />
                  <ArrowRight className="mx-auto size-6 shrink-0 rotate-90 text-amber-500 md:rotate-0" aria-hidden />
                  <AiPanel
                    label="KamehaDB writes"
                    labelClassName="text-amber-300 bg-amber-950/60 border-amber-500/30"
                    src="/images/sql-panel.png"
                    alt="The PostgreSQL query KamehaDB generates: users joined to orders, filtered to active subscriptions, grouped by user and ordered by total spent."
                  />
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="scroll-mt-16 py-16 md:py-24 px-4 md:px-6">
        <div className="max-w-6xl mx-auto">
          <SectionHeading
            title="Everything you need"
            subtitle="Powerful features to streamline your database workflow"
          />

          <div className="grid md:grid-cols-2 gap-5">
            {features.map((feature, index) => (
              <motion.div
                key={index}
                className="group relative bg-white dark:bg-surface-strong/40 border border-slate-200 dark:border-[#27273a] rounded-2xl p-6 md:p-8 overflow-hidden transition-all duration-500 hover:border-amber-500/30 hover:shadow-2xl hover:shadow-amber-500/5 dark:hover:shadow-amber-500/10"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-80px' }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
              >
                {/* Animated gradient bar on left */}
                <div className="absolute left-0 top-0 w-1 h-full bg-gradient-to-b from-amber-500 to-rose-500 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                {/* Subtle corner glow */}
                <div className="absolute -top-20 -right-20 w-40 h-40 bg-gradient-to-br from-amber-500/5 to-rose-500/5 rounded-full blur-2xl group-hover:from-amber-500/10 group-hover:to-rose-500/10 transition-all duration-700" />

                <div className="relative">
                  <motion.div
                    className="w-12 h-12 bg-gradient-to-br from-amber-500 to-rose-500 rounded-xl flex items-center justify-center mb-5 shadow-lg shadow-amber-500/20"
                    whileHover={{ rotate: 3, scale: 1.08 }}
                    transition={{ type: 'spring', stiffness: 300 }}
                  >
                    <feature.icon className="w-6 h-6 text-white" />
                  </motion.div>
                  <h3 className="text-lg font-bold text-ink mb-2">{feature.title}</h3>
                  <p className="text-sm text-body leading-relaxed">{feature.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Schema Graph Demo */}
      <section className="py-16 md:py-24 px-4 md:px-6">
        <div className="max-w-6xl mx-auto">
          <SectionHeading
            title="See your schema, visualized"
            subtitle="Explore tables and foreign keys as an interactive ER diagram. Shown here with sample data."
          />
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
          >
            <div className="relative">
              <div className="absolute -inset-1 bg-gradient-to-r from-amber-500/10 via-rose-500/10 to-amber-500/10 rounded-3xl blur-xl opacity-50" />
              <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-[#27273a] shadow-2xl shadow-amber-500/5 bg-slate-50 dark:bg-[#0c0c16]">
                <SchemaGraph3D />
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Installation Section */}
      <section id="install" className="scroll-mt-16 py-16 md:py-24 px-4 md:px-6 bg-surface-soft">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-80px' }}
              variants={stagger}
            >
              <motion.h2
                className="text-4xl font-extrabold text-ink tracking-tight mb-6"
                variants={fadeUp}
                transition={{ duration: 0.5 }}
              >
                Get started in minutes
              </motion.h2>
              <motion.p
                className="text-xl text-body mb-8 leading-relaxed"
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
                    desc: 'PostgreSQL, MySQL, MariaDB, SQLite, SQL Server, Oracle, ClickHouse, DuckDB, MongoDB, or Redis',
                  },
                  { step: '3', title: 'Start exploring', desc: 'Browse schemas, run queries, and chat with AI' },
                ].map((item, i) => (
                  <motion.div
                    key={i}
                    className="flex items-start gap-4"
                    variants={fadeUp}
                    transition={{ duration: 0.4 }}
                  >
                    <div className="w-8 h-8 bg-amber-500 text-white rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0">
                      {item.step}
                    </div>
                    <div>
                      <h4 className="font-semibold text-ink">{item.title}</h4>
                      <p className="text-body text-sm">{item.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
              {/* Download first: most visitors want a binary, the terminal on the right is for contributors. */}
              <motion.div
                className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3"
                variants={fadeUp}
                transition={{ duration: 0.4 }}
              >
                <a
                  href={RELEASES_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-6 py-3 font-semibold text-zinc-950 transition-all hover:bg-amber-600 hover:shadow-lg hover:shadow-amber-500/25"
                >
                  <Download className="h-5 w-5" />
                  Download for free
                </a>
                <span className="text-sm text-muted">macOS · Windows · Linux</span>
              </motion.div>
            </motion.div>

            <motion.div
              className="relative group"
              initial={{ opacity: 0, x: 40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            >
              <div className="absolute -inset-0.5 bg-gradient-to-r from-amber-500/10 via-rose-500/10 to-amber-500/10 rounded-2xl blur opacity-40 group-hover:opacity-70 transition-opacity" />
              <div className="relative bg-[#0d0d14] border border-[#27273a] rounded-2xl p-6 shadow-2xl">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-3 h-3 rounded-full bg-rose-500/80" />
                  <div className="w-3 h-3 rounded-full bg-amber-500/80" />
                  <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
                  <span className="ml-2 font-mono text-xs text-slate-400">build from source</span>
                </div>
                <div className="font-mono text-sm space-y-2">
                  <motion.div
                    className="text-slate-400"
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
                    className="text-slate-400 mt-4"
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
                    className="text-slate-400 mt-4"
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 1.3 }}
                  >
                    # Build for macOS
                  </motion.div>

                  <motion.div
                    className="text-emerald-400"
                    initial={{ opacity: 0, x: -10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 1.5 }}
                  >
                    wails build -platform darwin/universal
                  </motion.div>

                  <motion.div
                    className="text-slate-400 mt-4"
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 1.8 }}
                  >
                    # Build for Windows
                  </motion.div>

                  <motion.div
                    className="text-emerald-400"
                    initial={{ opacity: 0, x: -10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 1.9 }}
                  >
                    wails build -platform windows/amd64
                  </motion.div>

                  <motion.div
                    className="text-slate-400 mt-4"
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 2.0 }}
                  >
                    # Build for Linux
                  </motion.div>

                  <motion.div
                    className="text-emerald-400"
                    initial={{ opacity: 0, x: -10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 2.1 }}
                  >
                    wails build -platform linux/amd64
                  </motion.div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>
    </main>
  );
}
