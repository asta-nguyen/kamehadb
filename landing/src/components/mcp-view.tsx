'use client';

import { useRef, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'motion/react';
import {
  Database,
  LayoutGrid,
  Columns3,
  Search,
  Terminal,
  GitBranch,
  Key,
  FileJson,
  Shield,
  ArrowRight,
  ExternalLink,
  type LucideIcon,
} from 'lucide-react';
import { ThemeToggle } from './theme-toggle';

interface Tool {
  name: string;
  description: string;
  signature: string;
  icon: LucideIcon;
}

const tools: Tool[] = [
  {
    name: 'list_connections',
    icon: Database,
    description: 'List saved KamehaDB connections (id, name, kind, host, port, database).',
    signature: '() → Connection[]',
  },
  {
    name: 'get_schema_summary',
    icon: LayoutGrid,
    description: 'Condensed tables and columns view for a SQL connection.',
    signature: '({ connectionId, schema? }) → { tables }',
  },
  {
    name: 'describe_table',
    icon: Columns3,
    description: 'Columns, primary keys, foreign keys, and indexes for one table.',
    signature: '({ connectionId, tableId }) → { columns, indexes }',
  },
  {
    name: 'search_schema',
    icon: Search,
    description: 'Case-insensitive substring search across table and column names.',
    signature: '({ connectionId, query, schema?, limit? }) → { matches }',
  },
  {
    name: 'run_readonly_query',
    icon: Terminal,
    description: 'Run SELECT, WITH, or SHOW. INSERT/UPDATE/DELETE/DROP are rejected.',
    signature: '({ connectionId, query, params? }) → QueryResult',
  },
  {
    name: 'explain_query',
    icon: GitBranch,
    description: 'Run EXPLAIN on a SELECT to see the query plan before optimizing.',
    signature: '({ connectionId, query }) → QueryResult',
  },
  {
    name: 'scan_redis_keys',
    icon: Key,
    description: 'Cursor-based SCAN over Redis keys (not the blocking KEYS command).',
    signature: '({ connectionId, pattern, count, cursor }) → KeyPage',
  },
  {
    name: 'find_mongo_documents',
    icon: FileJson,
    description: 'Find documents in a Mongo collection with filter, projection, sort, limit.',
    signature: '({ connectionId, collection, database?, filter, ... }) → Documents',
  },
];

interface ClientConfig {
  name: string;
  file: string;
  content: string;
  lang: 'json' | 'toml';
}

const clientConfigs: ClientConfig[] = [
  {
    name: 'Claude Code',
    file: '~/.claude/mcp.json',
    lang: 'json',
    content: `{
  "mcpServers": {
    "kamehadb": {
      "command": "pnpm",
      "args": ["--filter", "@kamehadb/mcp-server", "start"],
      "env": { "KAMEHADB_SIDECAR_URL": "http://127.0.0.1:3170" }
    }
  }
}`,
  },
  {
    name: 'Codex CLI',
    file: '~/.codex/config.toml',
    lang: 'toml',
    content: `[mcp_servers.kamehadb]
command = "pnpm"
args = ["--filter", "@kamehadb/mcp-server", "start"]

[mcp_servers.kamehadb.env]
KAMEHADB_SIDECAR_URL = "http://127.0.0.1:3170"`,
  },
  {
    name: 'OpenCode',
    file: '~/.config/opencode/config.json',
    lang: 'json',
    content: `{
  "mcp": {
    "kamehadb": {
      "command": "pnpm",
      "args": ["--filter", "@kamehadb/mcp-server", "start"],
      "env": { "KAMEHADB_SIDECAR_URL": "http://127.0.0.1:3170" }
    }
  }
}`,
  },
];

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0 },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.1 } },
};

function SectionHeading({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle: string }) {
  return (
    <motion.div
      className="text-center mb-12"
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-80px' }}
      variants={stagger}
    >
      {eyebrow && (
        <motion.div
          className="inline-flex items-center gap-2 px-3 py-1 bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 rounded-full text-xs font-semibold mb-4 tracking-wide uppercase"
          variants={fadeUp}
          transition={{ duration: 0.4 }}
        >
          {eyebrow}
        </motion.div>
      )}
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
      <motion.p className="text-lg text-body max-w-2xl mx-auto" variants={fadeUp} transition={{ duration: 0.5 }}>
        {subtitle}
      </motion.p>
    </motion.div>
  );
}

function CodeBlock({ filename, content, lang }: { filename: string; content: string; lang: 'json' | 'toml' }) {
  const codeRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (codeRef.current) {
      const hljs = (async () => {
        const hljsModule = await import('highlight.js');
        const hljs = hljsModule.default;
        if (lang === 'toml') {
          await import('highlight.js/lib/languages/ini');
          hljs.registerLanguage('toml', (await import('highlight.js/lib/languages/ini')).default);
        }
        hljs.highlightElement(codeRef.current!);
      })();
    }
  }, [content, lang]);

  return (
    <div className="bg-[#0d0d14] border border-[#27273a] rounded-2xl overflow-hidden shadow-2xl">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-[#12121a] border-b border-[#27273a]">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-rose-500/60" />
          <div className="w-3 h-3 rounded-full bg-amber-500/60" />
          <div className="w-3 h-3 rounded-full bg-emerald-500/60" />
        </div>
        <span className="text-xs text-slate-400 ml-3 font-mono">{filename}</span>
        <span className="ml-auto text-[10px] uppercase tracking-wider text-slate-500 font-mono">{lang}</span>
      </div>
      <pre className="font-mono text-xs md:text-sm leading-relaxed overflow-x-auto p-4 md:p-5 !bg-transparent !text-slate-100">
        <code ref={codeRef} className={`!bg-transparent language-${lang}`}>
          {content}
        </code>
      </pre>
    </div>
  );
}

export default function McpView() {
  return (
    <div className="min-h-screen bg-canvas font-sans antialiased">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-canvas/70 border-b border-border/60">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group cursor-pointer">
            <div className="w-9 h-9 relative">
              <Image src="/logo.png" alt="KamehaDB" fill className="object-contain" />
            </div>
            <span className="font-bold text-ink text-lg">KamehaDB</span>
          </Link>
          <div className="flex items-center gap-6">
            <Link
              href="/"
              className="text-body hover:text-amber-600 dark:hover:text-amber-400 transition-colors text-sm font-medium hidden sm:block"
            >
              Home
            </Link>
            <Link
              href="/changelog"
              className="text-body hover:text-amber-600 dark:hover:text-amber-400 transition-colors text-sm font-medium hidden sm:block"
            >
              Changelog
            </Link>
            <a
              href="https://github.com/asta-nguyen/kamehadb/tree/main/apps/mcp-server"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-xl transition-all hover:shadow-lg hover:shadow-amber-500/25"
            >
              <ExternalLink className="w-4 h-4" />
              GitHub
            </a>
            <ThemeToggle />
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-32 pb-16 md:pb-20 px-4 md:px-6 overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(245,158,11,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(245,158,11,0.06)_1px,transparent_1px)] bg-size-[64px_64px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-160 h-160 bg-linear-to-br from-amber-500/10 via-rose-500/5 to-transparent rounded-full blur-3xl pointer-events-none" />
        <div className="max-w-4xl mx-auto text-center relative">
          <motion.div
            className="inline-flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 rounded-full text-sm font-medium mb-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
            Now in the KamehaDB repo
          </motion.div>
          <motion.h1
            className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-ink tracking-tight mb-6 leading-tight"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            KamehaDB{' '}
            <span className="bg-linear-to-r from-amber-500 to-rose-500 bg-clip-text text-transparent">MCP</span> Server
          </motion.h1>
          <motion.p
            className="text-xl text-body max-w-2xl mx-auto mb-10 leading-relaxed"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            8 read-only tools for AI coding assistants. Works with Claude Code, Codex CLI, and OpenCode.
          </motion.p>
          <motion.div
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <a
              href="#setup"
              className="px-8 py-4 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl transition-all hover:shadow-lg hover:shadow-amber-500/25 hover:scale-105 inline-flex items-center gap-2"
            >
              Setup
              <ArrowRight className="w-4 h-4" />
            </a>
            <a
              href="https://github.com/asta-nguyen/kamehadb"
              target="_blank"
              rel="noopener noreferrer"
              className="px-8 py-4 border border-slate-300 dark:border-slate-700 hover:border-amber-300 dark:hover:border-amber-500 text-slate-700 dark:text-body font-medium rounded-xl transition-all hover:bg-surface-soft dark:hover:bg-surface-strong"
            >
              View on GitHub
            </a>
          </motion.div>
        </div>
      </section>

      {/* What is this? */}
      <section className="py-12 md:py-16 px-4 md:px-6">
        <div className="max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.6 }}
            className="bg-white dark:bg-surface-strong/40 border border-slate-200 dark:border-[#27273a] rounded-2xl p-6 md:p-8"
          >
            <h2 className="text-2xl font-bold text-ink mb-4">What is this?</h2>
            <div className="space-y-4 text-body leading-relaxed">
              <p>
                <strong className="text-ink">MCP (Model Context Protocol)</strong> is an open standard that lets AI
                assistants call external tools. When you connect Claude Code, Codex, or OpenCode to an MCP server, the
                assistant can read your database schema, run queries, and explore collections — all from your existing
                KamehaDB connections.
              </p>
              <p>
                KamehaDB&apos;s MCP server is a thin stdio process that wraps the existing sidecar. It adds no database
                access of its own — every request flows through the same adapters, with the same caching and the same
                read-only enforcement. Drop the sidecar URL in your AI client config and you have 8 read-only tools
                ready to use.
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* 8 Tools */}
      <section className="py-12 md:py-16 px-4 md:px-6 bg-surface-soft/30">
        <div className="max-w-6xl mx-auto">
          <SectionHeading
            eyebrow="Tools"
            title="8 read-only tools"
            subtitle="Every tool calls the sidecar over HTTP and returns structured data the model can reason about."
          />
          <div className="grid md:grid-cols-2 gap-5">
            {tools.map((tool, index) => (
              <motion.div
                key={tool.name}
                className="group relative bg-white dark:bg-surface-strong/40 border border-slate-200 dark:border-[#27273a] rounded-2xl p-6 md:p-8 overflow-hidden transition-all duration-500 hover:border-amber-500/30 hover:shadow-2xl hover:shadow-amber-500/5 dark:hover:shadow-amber-500/10"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-80px' }}
                transition={{ duration: 0.5, delay: index * 0.05 }}
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
              >
                <div className="absolute left-0 top-0 w-1 h-full bg-gradient-to-b from-amber-500 to-rose-500 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="absolute -top-20 -right-20 w-40 h-40 bg-gradient-to-br from-amber-500/5 to-rose-500/5 rounded-full blur-2xl group-hover:from-amber-500/10 group-hover:to-rose-500/10 transition-all duration-700" />
                <div className="relative">
                  <div className="flex items-start gap-4 mb-3">
                    <motion.div
                      className="w-11 h-11 bg-gradient-to-br from-amber-500 to-rose-500 rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-amber-500/20"
                      whileHover={{ rotate: 3, scale: 1.08 }}
                      transition={{ type: 'spring', stiffness: 300 }}
                    >
                      <tool.icon className="w-5 h-5 text-white" />
                    </motion.div>
                    <div className="flex-1 min-w-0">
                      <code className="text-base font-bold text-ink font-mono break-all">{tool.name}</code>
                    </div>
                  </div>
                  <p className="text-sm text-body leading-relaxed mb-3">{tool.description}</p>
                  <code className="block text-[11px] text-muted font-mono leading-relaxed wrap-break-word">
                    {tool.signature}
                  </code>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Setup */}
      <section id="setup" className="py-16 md:py-24 px-4 md:px-6">
        <div className="max-w-4xl mx-auto">
          <SectionHeading
            eyebrow="Setup"
            title="Drop it into your client"
            subtitle="Prerequisite: run pnpm dev:sidecar in the KamehaDB repo so the MCP server can reach the sidecar on 127.0.0.1:3170."
          />
          <div className="space-y-8">
            {clientConfigs.map((client, index) => (
              <motion.div
                key={client.name}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-80px' }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                <div className="flex items-baseline justify-between mb-3">
                  <h3 className="text-lg font-bold text-ink">{client.name}</h3>
                  <code className="text-xs text-muted font-mono">{client.file}</code>
                </div>
                <CodeBlock filename={client.file} content={client.content} lang={client.lang} />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Safety callout */}
      <section className="py-12 md:py-16 px-4 md:px-6 bg-surface-soft/30">
        <div className="max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.6 }}
            className="relative bg-white dark:bg-surface-strong/40 border border-emerald-500/30 rounded-2xl p-6 md:p-8 overflow-hidden"
          >
            <div className="absolute -top-20 -right-20 w-40 h-40 bg-emerald-500/5 rounded-full blur-2xl" />
            <div className="relative flex items-start gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-emerald-500/20">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-ink mb-2">Read-only by default</h3>
                <p className="text-body leading-relaxed">
                  Mutations are rejected by the sidecar before reaching the database. INSERT, UPDATE, DELETE, DROP,
                  ALTER, and friends all return a{' '}
                  <code className="text-xs bg-surface-soft px-1.5 py-0.5 rounded">403 FORBIDDEN</code> to the model. The
                  MCP server has no override — flip{' '}
                  <code className="text-xs bg-surface-soft px-1.5 py-0.5 rounded">readonly: false</code> on the
                  connection profile in the desktop app to allow writes.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative py-16 md:py-24 px-4 md:px-6 overflow-hidden">
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
            Wire it up, then ask
          </motion.h2>
          <motion.p className="text-lg text-body mb-8" variants={fadeUp} transition={{ duration: 0.5 }}>
            &ldquo;List my KamehaDB connections, show the schema of{' '}
            <code className="text-sm bg-surface-soft px-1.5 py-0.5 rounded">Demo (postgres)</code>, and run{' '}
            <code className="text-sm bg-surface-soft px-1.5 py-0.5 rounded">SELECT count(*) FROM users</code>.&rdquo;
          </motion.p>
          <motion.div variants={fadeUp} transition={{ duration: 0.5 }}>
            <motion.a
              href="https://github.com/asta-nguyen/kamehadb/tree/main/apps/mcp-server"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-8 py-4 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl transition-colors hover:shadow-lg hover:shadow-amber-500/25"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.98 }}
            >
              Read the source
              <ArrowRight className="w-4 h-4" />
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
            <Link href="/" className="hover:text-amber-600 dark:hover:text-amber-400 transition-colors">
              Home
            </Link>
            <Link href="/mcp" className="hover:text-amber-600 dark:hover:text-amber-400 transition-colors">
              MCP
            </Link>
            <Link href="/changelog" className="hover:text-amber-600 dark:hover:text-amber-400 transition-colors">
              Changelog
            </Link>
            <a
              href="https://github.com/asta-nguyen/kamehadb"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
