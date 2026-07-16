'use client';

import { useState, useMemo, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, X, Copy, CheckCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ENGINES,
  ENGINE_TYPE_COLORS,
  ENGINE_TYPE_FILTERS,
  ENGINE_TYPE_LABELS,
  type EngineInfo,
  type EngineType,
} from '@/lib/engines';

// Engine logos from thesvg
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

// TigerBeetle logo — inlined from public/images/tigerbeetle.svg
// (no logo available in thesvg/simple-icons, so we use the project's own)
// Uses currentColor so it adapts to light/dark card backgrounds
const TIGERBEETLE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 29 24" preserveAspectRatio="xMidYMid meet"><path d="M 8.01 22.84 L 9.411 13.246 C 10.01 9.166 13.51 6.143 17.633 6.142 L 15.744 18.608 C 15.102 21.536 11.728 23.475 8.01 22.84 Z" fill="currentColor"/><path d="M 20.637 6.466 L 0 6.466 C 0 2.928 3.135 0 6.792 0 L 27.429 0 C 27.429 3.538 24.294 6.466 20.637 6.466 Z" fill="currentColor"/></svg>';

type FilterOption = 'all' | EngineType;
const FILTER_OPTIONS: FilterOption[] = ['all', ...ENGINE_TYPE_FILTERS];
const FILTER_LABELS: Record<FilterOption, string> = {
  all: 'All',
  ...ENGINE_TYPE_LABELS,
};

const TYPE_HEX: Record<EngineType, string> = {
  sql: '#3b82f6',
  document: '#10b981',
  cache: '#f43f5e',
  vector: '#a855f7',
  ledger: '#f59e0b',
};

// Map engine kind → logo module
// Sanitize SVG: remove fixed width/height so CSS can control sizing,
// ensure preserveAspectRatio keeps the logo proportional,
// and replace white/invisible fills+strokes with currentColor so logos
// are visible on both light and dark card backgrounds.
function sanitizeSvg(svg: string): string {
  let result = svg
    .replace(/width="[^"]*"/g, '')
    .replace(/height="[^"]*"/g, '')
    .replace(/preserveAspectRatio="[^"]*"/g, 'preserveAspectRatio="xMidYMid meet"')
    // Replace white fills with currentColor
    .replace(/fill="#fff"/g, 'fill="currentColor"')
    .replace(/fill="#FFF"/g, 'fill="currentColor"')
    .replace(/fill="#ffffff"/g, 'fill="currentColor"')
    .replace(/fill="#FFFFFF"/g, 'fill="currentColor"')
    .replace(/fill="white"/g, 'fill="currentColor"')
    // Replace white strokes (in style attrs) with currentColor
    .replace(/stroke:#fff/g, 'stroke:currentColor')
    .replace(/stroke:#FFF/g, 'stroke:currentColor')
    .replace(/stroke:#ffffff/g, 'stroke:currentColor')
    .replace(/stroke:#FFFFFF/g, 'stroke:currentColor')
    .replace(/stroke:white/g, 'stroke:currentColor')
    // Harden against XSS: strip scripts, event handlers, and foreign content.
    // Logos are build-time-bundled static SVG strings, not runtime input —
    // this is defense-in-depth, not a response to a live vector.
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '')
    .replace(/(xlink:href|href)="javascript:[^"]*"/gi, '$1="#"');

  // If the SVG has <path> elements with no fill attribute at all,
  // add fill="currentColor" (SVG default is black, invisible on dark)
  if (!result.includes('fill=') && result.includes('<path')) {
    result = result.replace(/<path /g, '<path fill="currentColor" ');
  }

  return result;
}

const LOGOS: Record<string, { svg: string }> = {
  postgres: { svg: sanitizeSvg(postgresql.svg) },
  mysql: { svg: sanitizeSvg(mysql.svg) },
  mariadb: { svg: sanitizeSvg(mariadb.svg) },
  sqlite: { svg: sanitizeSvg(sqlite.svg) },
  sqlserver: { svg: sanitizeSvg(microsoftSqlServer.svg) },
  oracle: { svg: sanitizeSvg(oracle.svg) },
  clickhouse: { svg: sanitizeSvg(clickhouse.svg) },
  duckdb: { svg: sanitizeSvg(duckdb.svg) },
  mongodb: { svg: sanitizeSvg(mongodb.svg) },
  redis: { svg: sanitizeSvg(redis.svg) },
  qdrant: { svg: sanitizeSvg(qdrant.svg) },
  tigerbeetle: { svg: TIGERBEETLE_SVG },
};

function useCopySnippet() {
  const [copiedKind, setCopiedKind] = useState<string | null>(null);
  const copy = useCallback(async (engine: EngineInfo) => {
    try {
      await navigator.clipboard.writeText(engine.dockerSnippet);
      setCopiedKind(engine.kind);
      setTimeout(() => setCopiedKind((prev) => (prev === engine.kind ? null : prev)), 2000);
    } catch {}
  }, []);
  return { copiedKind, copy };
}

function EngineCard({
  engine,
  copied,
  onCopy,
}: {
  engine: EngineInfo;
  copied: boolean;
  onCopy: (engine: EngineInfo) => void;
}) {
  const [flipped, setFlipped] = useState(false);
  const logo = LOGOS[engine.kind];
  const typeColor = TYPE_HEX[engine.type];
  const supportedCount = engine.features.filter((f) => f.supported).length;

  return (
    <div
      className="group relative h-52 [perspective:1200px] cursor-pointer"
      role="button"
      tabIndex={0}
      onClick={() => setFlipped((f) => !f)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setFlipped((f) => !f);
        }
      }}
    >
      <motion.div
        className="relative w-full h-full [transform-style:preserve-3d]"
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* ── Front: logo + name + feature count ── */}
        <div
          className="absolute inset-0 [backface-visibility:hidden] rounded-2xl overflow-hidden border border-slate-200 dark:border-[#27273a] bg-white dark:bg-[#11111e] flex flex-col items-center justify-center p-5"
          style={{
            boxShadow: `0 4px 24px -8px ${typeColor}30`,
          }}
          aria-hidden={flipped}
          tabIndex={flipped ? -1 : undefined}
        >
          {/* Glow on hover */}
          <div
            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
            style={{ background: `radial-gradient(circle at 50% 40%, ${typeColor}15, transparent 70%)` }}
          />

          {/* Logo */}
          <div
            className="relative w-16 h-12 mb-3 flex items-center justify-center transition-transform duration-500 group-hover:scale-110 [&>svg]:w-full [&>svg]:h-full text-ink dark:text-white"
            dangerouslySetInnerHTML={{ __html: logo.svg }}
          />

          {/* Name */}
          <span className="relative text-sm font-bold text-ink">{engine.label}</span>

          {/* Type badge */}
          <span
            className={cn(
              'relative mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border',
              ENGINE_TYPE_COLORS[engine.type],
            )}
          >
            {ENGINE_TYPE_LABELS[engine.type]}
          </span>

          {/* Feature count bar */}
          <div className="relative mt-3 flex items-center gap-2">
            <div className="w-24 h-1.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ background: typeColor }}
                initial={{ width: 0 }}
                whileInView={{ width: `${(supportedCount / engine.features.length) * 100}%` }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              />
            </div>
            <span className="text-[10px] font-mono text-muted">
              {supportedCount}/{engine.features.length}
            </span>
          </div>

          {/* Hint */}
          <span className="relative mt-2 text-[9px] text-muted/50 font-mono uppercase tracking-wider">
            Click for details
          </span>
        </div>

        {/* ── Back: features + docker ── */}
        <div
          className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)] rounded-2xl overflow-hidden border border-slate-200 dark:border-[#27273a] bg-white dark:bg-[#11111e] p-4 flex flex-col"
          style={{ boxShadow: `0 4px 24px -8px ${typeColor}30` }}
          aria-hidden={!flipped}
          tabIndex={!flipped ? -1 : undefined}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-bold text-ink">{engine.label}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCopy(engine);
              }}
              tabIndex={!flipped ? -1 : undefined}
              className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-colors"
            >
              {copied ? <CheckCheck className="size-3" /> : <Copy className="size-3" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>

          {/* Features */}
          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 flex-1 overflow-hidden">
            {engine.features.map((f) => (
              <div key={f.label} className="flex items-center gap-1 text-[10px]">
                {f.supported ? (
                  <Check className="size-2.5 text-emerald-500 shrink-0" />
                ) : (
                  <X className="size-2.5 text-muted/30 shrink-0" />
                )}
                <span className={cn(f.supported ? 'text-body' : 'text-muted/40 line-through')}>{f.label}</span>
              </div>
            ))}
          </div>

          {/* Docker snippet */}
          <pre className="mt-2 bg-[#0d0d14] border border-[#27273a] rounded p-2 text-[9px] font-mono text-emerald-400 overflow-x-auto whitespace-pre max-h-16">
            {engine.dockerSnippet.split('\n').slice(0, 3).join('\n')}
          </pre>
        </div>
      </motion.div>
    </div>
  );
}

export function EngineMatrix() {
  const [activeFilter, setActiveFilter] = useState<FilterOption>('all');
  const { copiedKind, copy } = useCopySnippet();

  const filtered = useMemo(() => {
    if (activeFilter === 'all') return ENGINES;
    return ENGINES.filter((e) => e.type === activeFilter);
  }, [activeFilter]);

  return (
    <div>
      {/* Type filter row */}
      <div className="flex flex-wrap items-center justify-center gap-2 mb-10">
        {FILTER_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setActiveFilter(option)}
            className={cn(
              'px-4 py-1.5 rounded-full text-sm font-medium transition-all',
              activeFilter === option
                ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/25'
                : 'bg-surface-soft text-body border border-border hover:border-amber-500/30',
            )}
          >
            {FILTER_LABELS[option]}
          </button>
        ))}
      </div>

      {/* Engine cards grid */}
      <motion.div layout className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <AnimatePresence mode="popLayout">
          {filtered.map((engine) => (
            <motion.div
              key={engine.kind}
              layout
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.3 }}
            >
              <EngineCard engine={engine} copied={copiedKind === engine.kind} onCopy={copy} />
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
