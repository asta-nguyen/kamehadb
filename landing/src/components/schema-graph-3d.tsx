'use client';

import { useRef } from 'react';
import { motion, useInView } from 'motion/react';
import { SAMPLE_SCHEMA, type SampleTable, type SampleColumn } from '../lib/sample-schema';

// Spread positions — no overlap, no cropping, fits 5 tables cleanly
const POSITIONS: Record<string, { x: number; y: number }> = {
  users: { x: 20, y: 18 },
  categories: { x: 72, y: 18 },
  products: { x: 72, y: 62 },
  orders: { x: 20, y: 62 },
  reviews: { x: 45, y: 40 },
};

const TABLE_META: Record<string, { color: string; glow: string; icon: string }> = {
  users: { color: '#3b82f6', glow: '#3b82f640', icon: 'U' },
  categories: { color: '#f59e0b', glow: '#f59e0b40', icon: 'C' },
  products: { color: '#10b981', glow: '#10b98140', icon: 'P' },
  orders: { color: '#8b5cf6', glow: '#8b5cf640', icon: 'O' },
  reviews: { color: '#ec4899', glow: '#ec489940', icon: 'R' },
};

function ColumnRow({ col }: { col: SampleColumn }) {
  return (
    <div className="flex items-center justify-between px-3 py-[5px] text-[11px] border-b border-slate-100/60 dark:border-white/5 last:border-0">
      <div className="flex items-center gap-1.5">
        {col.primaryKey && (
          <span className="px-1 py-px text-[8px] font-bold rounded bg-amber-500/15 text-amber-600 dark:text-amber-400">
            PK
          </span>
        )}
        {col.foreignKey && (
          <span className="px-1 py-px text-[8px] font-bold rounded bg-blue-500/15 text-blue-600 dark:text-blue-400">
            FK
          </span>
        )}
        <span
          className={`font-mono ${
            col.primaryKey
              ? 'text-amber-600 dark:text-amber-400 font-semibold'
              : col.foreignKey
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-slate-600 dark:text-slate-300'
          }`}
        >
          {col.name}
        </span>
      </div>
      <span className="text-slate-400 dark:text-slate-500 font-mono text-[10px] tracking-tight">{col.type}</span>
    </div>
  );
}

function TableCard({
  table,
  position,
  meta,
  index,
  visible,
}: {
  table: SampleTable;
  position: { x: number; y: number };
  meta: { color: string; glow: string; icon: string };
  index: number;
  visible: boolean;
}) {
  return (
    <motion.div
      className="absolute z-10"
      style={{
        left: `${position.x}%`,
        top: `${position.y}%`,
        transform: 'translate(-50%, -50%)',
      }}
      initial={{ opacity: 0, scale: 0.7, y: 30 }}
      animate={visible ? { opacity: 1, scale: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay: index * 0.12, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Glow halo */}
      <motion.div
        className="absolute -inset-3 rounded-xl blur-lg"
        style={{ background: meta.glow }}
        animate={{ opacity: [0.4, 0.7, 0.4] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut', delay: index * 0.3 }}
      />
      {/* Card */}
      <motion.div
        className="relative w-32 sm:w-40 rounded-xl overflow-hidden shadow-2xl border border-slate-200/80 dark:border-white/10 bg-white dark:bg-[#11111e]"
        animate={{ y: [0, -4, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: index * 0.5 }}
      >
        {/* Header with gradient + shine */}
        <div
          className="px-3 py-2 text-white text-sm font-bold flex items-center gap-2 relative overflow-hidden"
          style={{ background: `linear-gradient(135deg, ${meta.color}, ${meta.color}cc)` }}
        >
          <div
            className="absolute inset-0 opacity-20"
            style={{
              background: 'linear-gradient(110deg, transparent 30%, white 50%, transparent 70%)',
            }}
          />
          <span className="relative w-5 h-5 rounded flex items-center justify-center text-[10px] font-black bg-white/25">
            {meta.icon}
          </span>
          <span className="relative">{table.name}</span>
          <span className="relative ml-auto text-[9px] font-mono opacity-60">{table.columns.length} cols</span>
        </div>
        {/* Columns */}
        <div className="py-0.5">
          {table.columns.map((col) => (
            <ColumnRow key={col.name} col={col} />
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

// Curved SVG path between two points
function curvePath(x1: number, y1: number, x2: number, y2: number): string {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const offset = Math.min(dist * 0.15, 18);
  const cx = mx - (dy / dist) * offset;
  const cy = my + (dx / dist) * offset;
  return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
}

// Self-loop SVG path for same-table FK relations (e.g. categories.parent_id → categories)
function selfLoopPath(x: number, y: number): string {
  const r = 7;
  return `M ${x} ${y} C ${x - r} ${y - r * 2}, ${x + r} ${y - r * 2}, ${x} ${y}`;
}

export function SchemaGraph3D() {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: true, margin: '-80px' });

  const tables = SAMPLE_SCHEMA.tables;

  // Build FK connections
  const connections: {
    from: string;
    to: string;
    fromPos: { x: number; y: number };
    toPos: { x: number; y: number };
    self: boolean;
    color: string;
  }[] = [];

  for (const table of tables) {
    const fromPos = POSITIONS[table.name];
    if (!fromPos) continue;
    for (const col of table.columns) {
      if (!col.foreignKey) continue;
      const toPos = POSITIONS[col.foreignKey.table];
      if (!toPos) continue;
      const self = col.foreignKey.table === table.name;
      const fromMeta = TABLE_META[table.name];
      connections.push({
        from: table.name,
        to: col.foreignKey.table,
        fromPos,
        toPos,
        self,
        color: fromMeta?.color ?? '#f59e0b',
      });
    }
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden rounded-xl bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50 dark:from-[#0a0a14] dark:via-[#0d0d1a] dark:to-[#0a0a14]"
      style={{ height: 560 }}
    >
      {/* Subtle grid background */}
      <div
        className="absolute inset-0 opacity-[0.04] dark:opacity-[0.07]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(100,100,200,1) 1px, transparent 1px), linear-gradient(90deg, rgba(100,100,200,1) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      {/* SVG layer for FK lines */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <defs>
          <filter id="fk-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="0.4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {connections.map((conn, i) => (
          <g key={`${conn.from}-${conn.to}-${i}`}>
            {/* Static base line */}
            <motion.path
              d={
                conn.self
                  ? selfLoopPath(conn.fromPos.x, conn.fromPos.y)
                  : curvePath(conn.fromPos.x, conn.fromPos.y, conn.toPos.x, conn.toPos.y)
              }
              fill="none"
              stroke={conn.color}
              strokeWidth={0.2}
              strokeLinecap="round"
              opacity={0.15}
              initial={{ pathLength: 0 }}
              animate={isInView ? { pathLength: 1 } : {}}
              transition={{ duration: 1.2, delay: 0.5 + i * 0.12, ease: 'easeOut' }}
            />
            {/* Glowing drawn line */}
            <motion.path
              d={
                conn.self
                  ? selfLoopPath(conn.fromPos.x, conn.fromPos.y)
                  : curvePath(conn.fromPos.x, conn.fromPos.y, conn.toPos.x, conn.toPos.y)
              }
              fill="none"
              stroke={conn.color}
              strokeWidth={0.3}
              strokeLinecap="round"
              filter="url(#fk-glow)"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={isInView ? { pathLength: 1, opacity: 0.6 } : {}}
              transition={{
                pathLength: { duration: 1.2, delay: 0.5 + i * 0.12, ease: 'easeOut' },
                opacity: { duration: 0.3, delay: 0.5 + i * 0.12 },
              }}
            />
            {/* Moving pulse along the line */}
            <motion.path
              d={
                conn.self
                  ? selfLoopPath(conn.fromPos.x, conn.fromPos.y)
                  : curvePath(conn.fromPos.x, conn.fromPos.y, conn.toPos.x, conn.toPos.y)
              }
              fill="none"
              stroke={conn.color}
              strokeWidth={0.5}
              strokeLinecap="round"
              strokeDasharray="0.8 12"
              opacity={0}
              initial={{ opacity: 0, strokeDashoffset: 0 }}
              animate={
                isInView
                  ? {
                      opacity: [0, 0.9, 0.9, 0],
                      strokeDashoffset: [0, -24],
                    }
                  : {}
              }
              transition={{
                opacity: { duration: 0.5, delay: 1.5 + i * 0.12 },
                strokeDashoffset: {
                  duration: 2.5,
                  repeat: Infinity,
                  ease: 'linear',
                  delay: 1.5 + i * 0.12,
                },
              }}
            />
          </g>
        ))}
      </svg>

      {/* Table cards */}
      {tables.map((table, i) => {
        const pos = POSITIONS[table.name];
        if (!pos) return null;
        const meta = TABLE_META[table.name] ?? { color: '#64748b', glow: '#64748b40', icon: '?' };
        return <TableCard key={table.name} table={table} position={pos} meta={meta} index={i} visible={isInView} />;
      })}

      {/* Corner label */}
      <div className="absolute bottom-3 right-4 font-mono text-[10px] text-slate-400 dark:text-slate-600 tracking-wider uppercase pointer-events-none">
        5 tables · 6 FK relations
      </div>
    </div>
  );
}
