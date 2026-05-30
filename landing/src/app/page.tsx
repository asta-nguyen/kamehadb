'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'motion/react';
import { ThemeToggle } from '../components/theme-toggle';
import { Database, Sparkles, MessageSquare, Workflow } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../lib/utils';

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
        className="text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-4"
        variants={fadeUp}
        transition={{ duration: 0.5 }}
      >
        {title}
      </motion.h2>
      <motion.p
        className="text-xl text-slate-600 dark:text-slate-400 max-w-xl mx-auto"
        variants={fadeUp}
        transition={{ duration: 0.5 }}
      >
        {subtitle}
      </motion.p>
    </motion.div>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen bg-white dark:bg-[#0b0f1a] font-sans antialiased">
      {/* Navigation */}
      <motion.nav
        className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-white/70 dark:bg-[#0b0f1a]/70 border-b border-slate-200/60 dark:border-slate-800/60"
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group cursor-pointer">
            <div className="w-9 h-9 relative">
              <Image src="/logo.png" alt="KamehaDB" fill className="object-contain" />
            </div>
            <span className="font-bold text-slate-900 dark:text-slate-100 text-lg">KamehaDB</span>
          </Link>
          <div className="flex items-center gap-4">
            <a
              href="#features"
              className="text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors text-sm font-medium hidden sm:block"
            >
              Features
            </a>
            <a
              href="#install"
              className="text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors text-sm font-medium hidden sm:block"
            >
              Install
            </a>
            <a
              href="https://github.com/asta-nguyen/kamehadb"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium rounded-xl transition-all hover:shadow-lg hover:shadow-indigo-500/25"
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
      <section className="pt-32 pb-20 px-6 overflow-hidden">
        <div className="max-w-6xl mx-auto text-center">
          <motion.div
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 rounded-full text-sm font-medium mb-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <span className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
            Now with AI-powered query generation
          </motion.div>

          <motion.h1
            className="text-5xl md:text-6xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-6 leading-tight"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            Database management{' '}
            <span className="bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent">
              reimagined
            </span>
          </motion.h1>

          <motion.p
            className="text-xl text-slate-600 dark:text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            Connect to any database, explore schemas visually, and query with AI. The modern database management tool
            built for developers.
          </motion.p>

          <motion.div
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
          >
            <a
              href="#install"
              className="px-8 py-4 bg-indigo-500 hover:bg-indigo-600 text-white font-semibold rounded-xl transition-all hover:shadow-lg hover:shadow-indigo-500/25 hover:scale-105"
            >
              Get Started
            </a>
            <a
              href="#features"
              className="px-8 py-4 border border-slate-300 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-500 text-slate-700 dark:text-slate-300 font-medium rounded-xl transition-all hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Learn More
            </a>
          </motion.div>

          {/* Supported Engines */}
          <motion.div
            className="mt-16 pt-8 border-t border-slate-200 dark:border-slate-800"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
          >
            <motion.p
              className="text-sm text-slate-500 dark:text-slate-400 font-medium mb-4"
              variants={fadeUp}
              transition={{ duration: 0.4 }}
            >
              Works with your favorite databases
            </motion.p>
            <div className="flex items-center justify-center flex-wrap gap-3">
              {engines.map((engine, i) => (
                <motion.div
                  key={engine.name}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full text-sm font-medium text-slate-700 dark:text-slate-300 shadow-sm"
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
      <section className="py-20 px-6 bg-slate-50 dark:bg-[#0d1117]">
        <div className="max-w-6xl mx-auto">
          <motion.div
            className="relative"
            initial={{ opacity: 0, y: 40, scale: 0.97 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
          >
            <div className="bg-slate-900 rounded-3xl p-2 shadow-2xl shadow-indigo-500/10">
              <div className="flex items-center gap-2 px-4 py-2">
                <div className="w-3 h-3 rounded-full bg-red-500/80" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                <div className="w-3 h-3 rounded-full bg-green-500/80" />
              </div>
              <div className="bg-slate-800 rounded-2xl overflow-hidden relative">
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/40 to-slate-800 animate-pulse" />
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

      {/* Features Section */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <SectionHeading
            title="Everything you need"
            subtitle="Powerful features to streamline your database workflow"
          />

          <motion.div
            className="grid md:grid-cols-2 gap-6"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
            variants={stagger}
          >
            {features.map((feature, index) => (
              <motion.div
                key={index}
                className="group bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-2xl p-8 transition-colors hover:border-indigo-300 dark:hover:border-indigo-500/30"
                variants={fadeUp}
                transition={{ duration: 0.5 }}
                whileHover={{ y: -6, transition: { duration: 0.2 } }}
              >
                <motion.div
                  className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-2xl flex items-center justify-center mb-6"
                  whileHover={{ rotate: 5, scale: 1.1 }}
                  transition={{ type: 'spring', stiffness: 300 }}
                >
                  <feature.icon className="w-7 h-7 text-white" />
                </motion.div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">{feature.title}</h3>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed">{feature.description}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Installation Section */}
      <section id="install" className="py-24 px-6 bg-slate-50 dark:bg-[#0d1117]">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-80px' }}
              variants={stagger}
            >
              <motion.h2
                className="text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-6"
                variants={fadeUp}
                transition={{ duration: 0.5 }}
              >
                Get started in minutes
              </motion.h2>
              <motion.p
                className="text-xl text-slate-600 dark:text-slate-400 mb-8 leading-relaxed"
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
                    <div className="w-8 h-8 bg-indigo-500 text-white rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0">
                      {item.step}
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-900 dark:text-white">{item.title}</h4>
                      <p className="text-slate-600 dark:text-slate-400 text-sm">{item.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            <motion.div
              className="relative"
              initial={{ opacity: 0, x: 40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            >
              <div className="bg-slate-900 rounded-2xl p-6 shadow-2xl">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-3 h-3 rounded-full bg-red-500/80" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                  <div className="w-3 h-3 rounded-full bg-green-500/80" />
                </div>
                <div className="font-mono text-sm space-y-2">
                  <motion.div
                    className="text-slate-500"
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
                    className="text-slate-500 mt-4"
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
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-6">
        <motion.div
          className="max-w-4xl mx-auto text-center"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={stagger}
        >
          <motion.h2
            className="text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-6"
            variants={fadeUp}
            transition={{ duration: 0.5 }}
          >
            Ready to level up your database workflow?
          </motion.h2>
          <motion.p
            className="text-xl text-slate-600 dark:text-slate-400 mb-10"
            variants={fadeUp}
            transition={{ duration: 0.5 }}
          >
            Free, open source, and runs entirely on your machine.
          </motion.p>
          <motion.div variants={fadeUp} transition={{ duration: 0.5 }}>
            <motion.a
              href="https://github.com/asta-nguyen/kamehadb/releases"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-8 py-4 bg-indigo-500 hover:bg-indigo-600 text-white font-semibold rounded-xl transition-colors hover:shadow-lg hover:shadow-indigo-500/25"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.98 }}
            >
              Download for free
            </motion.a>
          </motion.div>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 py-12 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-9 h-9 relative">
              <Image src="/logo.png" alt="KamehaDB" fill className="object-contain" />
            </div>
            <span className="font-bold text-slate-900 dark:text-white">KamehaDB</span>
          </Link>
          <div className="flex items-center gap-6 text-sm text-slate-500 dark:text-slate-400">
            <a
              href="https://github.com/asta-nguyen/kamehadb"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
            >
              GitHub
            </a>
            <Link href="/changelog" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
              Changelog
            </Link>
            <a
              href="https://github.com/asta-nguyen/kamehadb/releases"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
            >
              Releases
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
