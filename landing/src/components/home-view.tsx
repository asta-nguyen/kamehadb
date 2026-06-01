'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ThemeToggle } from './theme-toggle';
import { Database, Sparkles, MessageSquare, Workflow, Star, Apple, Monitor, Laptop } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../lib/utils';
import { Compare } from './ui/compare';

const features: { icon: LucideIcon; title: string; description: string }[] = [
  {
    icon: Database,
    title: 'Multi-Database Support',
    description:
      'Connect to PostgreSQL, MySQL, SQLite, MongoDB, and Redis — all from one unified interface. Browse schemas, collections, and keys with an intuitive tree view.',
  },
  {
    icon: Sparkles,
    title: 'AI Query Generation',
    description:
      'Describe what you want in plain English. AI transforms your intent into optimized SQL, aggregation pipelines, or Redis commands.',
  },
  {
    icon: MessageSquare,
    title: 'Contextual AI Chat',
    description:
      'Chat with AI that knows your database schema. Ask follow-up questions, debug slow queries, and get precise answers.',
  },
  {
    icon: Workflow,
    title: 'Schema Visualization',
    description:
      'Auto-detect table structures, field types, indexes, and relationships. Generate ER diagrams and understand any database instantly.',
  },
];

const engines = [
  { name: 'PostgreSQL', color: 'text-blue-500' },
  { name: 'MySQL', color: 'text-orange-500' },
  { name: 'SQLite', color: 'text-teal-500' },
  { name: 'MongoDB', color: 'text-green-500' },
  { name: 'Redis', color: 'text-red-500' },
];

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
    <div className="relative w-full max-w-3xl mx-auto group">
      <div className="absolute -inset-1 bg-gradient-to-r from-amber-500/20 via-rose-500/20 to-amber-500/20 rounded-2xl blur-xl opacity-60 group-hover:opacity-80 transition-opacity" />
      <div className="relative bg-[#0d0d14] border border-[#27273a] rounded-xl shadow-2xl h-40 md:h-40 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 bg-[#12121a] border-b border-[#27273a] rounded-t-xl">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-rose-500/60" />
            <div className="w-3 h-3 rounded-full bg-amber-500/60" />
            <div className="w-3 h-3 rounded-full bg-emerald-500/60" />
          </div>
          <span className="text-xs text-slate-600 ml-3 font-mono flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded bg-amber-500/20 flex items-center justify-center text-[9px] text-amber-400 font-bold">
              &#60;
            </span>
            query.sql
          </span>
        </div>
        <div className="p-4 md:p-5 font-mono text-xs md:text-sm leading-relaxed">
          <div className="flex items-center gap-2 text-muted mb-2 md:mb-2.5 text-[10px] md:text-xs">
            <span className="text-emerald-400 font-semibold">kamehadb</span>
            <span className="text-slate-600">@</span>
            <span className="text-amber-400 font-semibold">local</span>
            <span className="text-slate-600">:</span>
            <span className="text-muted">~</span>
            <span className="text-slate-600">$</span>
          </div>
          <pre className="text-body whitespace-pre-wrap leading-relaxed overflow-hidden">
            {queries[queryIndex].slice(0, visibleChars)}
            <span className="text-amber-400/90 animate-[blink_0.8s_step-end_infinite] font-mono select-none">
              &#9608;
            </span>
          </pre>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen bg-canvas font-sans antialiased">
      {/* Navigation */}
      <motion.nav
        className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-canvas/70 border-b border-border/60 before:absolute before:inset-x-0 before:bottom-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-amber-500/30 before:to-transparent"
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group cursor-pointer">
            <div className="w-9 h-9 relative">
              <Image src="/logo.png" alt="KamehaDB" fill className="object-contain" />
            </div>
            <span className="font-bold text-slate-900 dark:text-slate-100 text-lg">KamehaDB</span>
          </Link>
          <div className="flex items-center gap-4">
            <a
              href="#features"
              className="text-body hover:text-amber-600 dark:hover:text-amber-400 transition-colors text-sm font-medium hidden sm:block"
            >
              Features
            </a>
            <Link
              href="/mcp"
              className="text-body hover:text-amber-600 dark:hover:text-amber-400 transition-colors text-sm font-medium hidden sm:block"
            >
              MCP
            </Link>
            <a
              href="#install"
              className="text-body hover:text-amber-600 dark:hover:text-amber-400 transition-colors text-sm font-medium hidden sm:block"
            >
              Install
            </a>
            <a
              href="https://github.com/asta-nguyen/kamehadb"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-xl transition-all hover:shadow-lg hover:shadow-amber-500/25"
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
      <section className="relative pt-24 md:pt-32 pb-16 md:pb-20 px-4 md:px-6 overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(245,158,11,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(245,158,11,0.06)_1px,transparent_1px)] bg-[size:64px_64px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-160 h-160 bg-gradient-to-br from-amber-500/10 via-rose-500/5 to-transparent rounded-full blur-3xl pointer-events-none" />
        <div className="max-w-6xl mx-auto text-center relative">
          <motion.div
            className="inline-flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 rounded-full text-sm font-medium mb-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
            Now with AI-powered query generation
          </motion.div>

          <motion.h1
            className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold text-ink tracking-tight mb-6 leading-tight"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            Database management{' '}
            <span className="bg-gradient-to-r from-amber-500 to-rose-500 bg-clip-text text-transparent">
              reimagined
            </span>
          </motion.h1>

          <motion.p
            className="text-xl text-body max-w-2xl mx-auto mb-6 leading-relaxed"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            Connect to any database, explore schemas visually, and query with AI. The modern database management tool
            built for developers.
          </motion.p>
          <motion.div
            className="flex items-center justify-center gap-2 mb-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.6 }}
          >
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-surface-strong/80 backdrop-blur-sm border border-border/50 rounded-full text-xs font-medium text-muted">
              <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
              <span className="tracking-tight">2+ stars on GitHub</span>
            </div>
          </motion.div>

          <motion.div
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
          >
            <a
              href="#install"
              className="px-8 py-4 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl transition-all hover:shadow-lg hover:shadow-amber-500/25 hover:scale-105"
            >
              Get Started
            </a>
            <a
              href="#features"
              className="px-8 py-4 border border-slate-300 dark:border-slate-700 hover:border-amber-300 dark:hover:border-amber-500 text-slate-700 dark:text-body font-medium rounded-xl transition-all hover:bg-surface-soft dark:hover:bg-surface-strong"
            >
              Learn More
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
                className="flex items-center gap-1.5 px-3 py-1 bg-surface-soft/50 border border-border/30 rounded-md text-[11px] font-medium text-muted transition-colors hover:border-amber-500/30 hover:text-body"
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
            className="mt-12 pt-6 border-t border-border"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
          >
            <motion.p className="text-sm text-muted font-medium mb-4" variants={fadeUp} transition={{ duration: 0.4 }}>
              Works with your favorite databases
            </motion.p>
            <div className="flex items-center justify-center flex-wrap gap-3">
              {engines.map((engine, i) => (
                <motion.div
                  key={engine.name}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-surface-strong border border-slate-200 dark:border-slate-700 rounded-full text-sm font-medium text-slate-700 dark:text-body shadow-sm"
                  variants={fadeUp}
                  transition={{ duration: 0.4, delay: i * 0.08 }}
                  whileHover={{ scale: 1.05, y: -2 }}
                >
                  <Database className={cn('w-4 h-4', engine.color)} />
                  {engine.name}
                </motion.div>
              ))}
            </div>
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
                <video
                  src="https://kamehadb.s3.ap-southeast-2.amazonaws.com/demo-kamehadb.mp4"
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full h-auto relative"
                />
              </div>
            </div>
          </motion.div>
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
              <div className="relative shadow-2xl shadow-amber-500/10 border border-slate-700/50 bg-surface-strong rounded-3xl overflow-hidden">
                <div className="relative">
                  <div className="absolute top-3 left-4 z-[22]">
                    <span className="text-xs font-medium text-body bg-surface-strong/80 backdrop-blur-sm px-3 py-1 rounded-full border border-slate-700/50">
                      You asks
                    </span>
                  </div>
                  <div className="absolute top-3 right-4 z-[22]">
                    <span className="text-xs font-medium text-amber-300 bg-amber-950/60 backdrop-blur-sm px-3 py-1 rounded-full border border-amber-500/30">
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
      <section id="features" className="py-16 md:py-24 px-4 md:px-6">
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

      {/* Installation Section */}
      <section id="install" className="py-16 md:py-24 px-4 md:px-6 bg-surface-soft">
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
                    desc: 'Connect to PostgreSQL, MySQL, SQLite, MongoDB, or Redis',
                  },
                  { step: '3', title: 'Start exploring', desc: 'Visualize schemas and query with AI assistance' },
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
                </div>
                <div className="font-mono text-sm space-y-2">
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
                    className="text-muted mt-4"
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
                    className="text-muted mt-4"
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
                    className="text-muted mt-4"
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
                    className="text-muted mt-4"
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
      <section className="relative py-16 md:py-24 px-4 md:px-6 overflow-hidden">
        <div className="absolute inset-0 bg-linear-to-b from-transparent via-amber-500/5 to-transparent" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-128 h-128 bg-gradient-to-br from-amber-500/8 via-rose-500/5 to-transparent rounded-full blur-3xl pointer-events-none" />
        <motion.div
          className="relative max-w-4xl mx-auto text-center bg-white/50 dark:bg-surface-strong/50 backdrop-blur-sm rounded-3xl border border-slate-200/60 dark:border-slate-700/50 p-6 md:p-12"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={stagger}
        >
          <motion.h2
            className="text-4xl font-extrabold text-ink tracking-tight mb-6"
            variants={fadeUp}
            transition={{ duration: 0.5 }}
          >
            Ready to level up your database workflow?
          </motion.h2>
          <motion.p className="text-xl text-body mb-10" variants={fadeUp} transition={{ duration: 0.5 }}>
            Free, open source, and runs entirely on your machine.
          </motion.p>
          <motion.div variants={fadeUp} transition={{ duration: 0.5 }}>
            <motion.a
              href="https://github.com/asta-nguyen/kamehadb/releases"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-8 py-4 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl transition-colors hover:shadow-lg hover:shadow-amber-500/25"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.98 }}
            >
              Download for free
            </motion.a>
          </motion.div>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 md:py-12 px-4 md:px-6">
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
    </div>
  );
}
