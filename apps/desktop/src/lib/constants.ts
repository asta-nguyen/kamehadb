/** Default page size for paginated views. */
export const PAGE_LIMIT = 20;

/** How long to cache schema metadata (5 minutes). */
export const SCHEMA_CACHE_TIME = 5 * 60 * 1000;

/** How long to cache database stats (30 seconds). */
export const STATS_CACHE_TIME = 30 * 1000;

import { PostgreSQL, MySQL, Redis, MongoDB, Oracle, MicrosoftSQLServer, ClickHouse } from 'developer-icons';
import type { DbKind } from '@kamehadb/shared';
import { FileText, History, BarChart3, Search, Share2, Terminal, type LucideIcon } from 'lucide-react';
import {
  openNewQueryTab,
  openGraphTab,
  openDatabaseStatsTab,
  openSchemaTimelineTab,
  openMigrationTab,
  openQdrantSearchTab,
  openMongoQueryTab,
  openMongoShellTab,
  openRedisQueryTab,
  openRedisTab,
  openSqliteVecSearchTab,
  appStore,
} from '@/store';
import type { ConnectionProfile } from '@kamehadb/shared';

export const KIND_ICON_COMPONENT: Record<DbKind, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  postgres: PostgreSQL,
  mysql: MySQL,
  sqlite: MySQL,
  redis: Redis,
  mongodb: MongoDB,
  qdrant: MongoDB,
  sqlserver: MicrosoftSQLServer,
  oracle: Oracle,
  clickhouse: ClickHouse,
  mariadb: MySQL,
  duckdb: PostgreSQL,
  tigerbeetle: PostgreSQL,
};

export const GROUP_ORDER: Record<string, number> = {
  postgres: 0,
  mysql: 1,
  sqlite: 2,
  redis: 3,
  mongodb: 4,
  qdrant: 5,
  sqlserver: 6,
  oracle: 7,
  clickhouse: 8,
  mariadb: 9,
  duckdb: 10,
  tigerbeetle: 11,
};

export const KIND_LABELS: Record<DbKind, string> = {
  postgres: 'PostgreSQL',
  sqlite: 'SQLite',
  mysql: 'MySQL',
  redis: 'Redis',
  mongodb: 'MongoDB',
  qdrant: 'Qdrant',
  sqlserver: 'SQL Server',
  oracle: 'Oracle',
  clickhouse: 'ClickHouse',
  mariadb: 'MariaDB',
  duckdb: 'DuckDB',
  tigerbeetle: 'TigerBeetle',
};

// Alias for GROUP_LABELS to match semantic usage — labels by engine kind are the
// same regardless of whether they appear as group headers or individual badges.
export const GROUP_LABELS = KIND_LABELS;

export const SIDEBAR_MIN_WIDTH = 250;
export const SIDEBAR_MAX_WIDTH = 400;
export const SIDEBAR_DEFAULT_WIDTH = 300;

export const KINDS: DbKind[] = [
  'postgres',
  'mysql',
  'sqlite',
  'redis',
  'mongodb',
  'qdrant',
  'sqlserver',
  'oracle',
  'clickhouse',
  'mariadb',
  'duckdb',
  'tigerbeetle',
];

/** Engine kinds that use the SQL adapter path (not Mongo/Redis/Qdrant/TigerBeetle). */
export const SQL_KINDS: readonly DbKind[] = [
  'postgres',
  'mysql',
  'sqlite',
  'sqlserver',
  'oracle',
  'clickhouse',
  'mariadb',
  'duckdb',
] as const;

export function isSqlKind(kind: string | undefined): kind is DbKind {
  return kind !== undefined && SQL_KINDS.includes(kind as DbKind);
}

export const DEFAULT_PORTS: Record<DbKind, number> = {
  postgres: 5432,
  mysql: 3306,
  sqlite: 0,
  redis: 6379,
  mongodb: 0,
  qdrant: 6333,
  sqlserver: 1433,
  oracle: 1521,
  clickhouse: 8123,
  mariadb: 3306,
  duckdb: 0,
  tigerbeetle: 3000,
};

export const PRESET_COLORS = [
  { hex: '#3b82f6', name: 'Blue' },
  { hex: '#10b981', name: 'Emerald' },
  { hex: '#f59e0b', name: 'Amber' },
  { hex: '#ef4444', name: 'Red' },
  { hex: '#8b5cf6', name: 'Violet' },
  { hex: '#ec4899', name: 'Pink' },
  { hex: '#06b6d4', name: 'Cyan' },
  { hex: '#84cc16', name: 'Lime' },
];

export const GREETINGS = {
  morning: [
    'Good morning! Ready to review your data?',
    "Morning! Let's see what's new in the database.",
    'Start the day with fresh insights.',
    "Data looks good this morning—what's first?",
    'Morning check: any updates to review today?',
  ],
  afternoon: [
    "Good afternoon! Let's dive into the tables.",
    'Afternoon snapshot: review your latest entries.',
    "Keep track of your data—here's the overview.",
    'Data updates are waiting—ready to explore?',
    'Afternoon check-in: any new records to inspect?',
  ],
  evening: [
    "Good evening! Let's finish today's data review.",
    'Evening overview: all tables up to date.',
    "Time to wrap up today's database tasks.",
    'Evening summary: see what changed today.',
    'Calm evening—check the last updates before closing.',
  ],
  night: [
    'Night mode: quiet time, check your data.',
    'Late hours? Inspect your tables calmly.',
    'Nightly review: last changes of the day.',
    'Data is steady—take a look before logging off.',
    "Midnight check: see today's records at a glance.",
  ],
} as const;

export const PROMPTS = [
  'Select a table to start reviewing.',
  'Check recent changes in the database.',
  'Filter by date or status to explore.',
  'Inspect records quickly with these tools.',
  'Ready for an update summary?',
];

export type ShortcutEntry = {
  keys: string;
  description: string;
};

export const SHORTCUT_GROUPS: { heading: string; entries: ShortcutEntry[] }[] = [
  {
    heading: 'Global',
    entries: [
      { keys: 'Ctrl+K', description: 'Open command palette / global search' },
      { keys: 'Ctrl+/', description: 'Show keyboard shortcuts' },
      { keys: 'Ctrl+,', description: 'Open API settings' },
      { keys: 'Ctrl+L', description: 'Open logs' },
    ],
  },
  {
    heading: 'Tabs',
    entries: [
      { keys: 'Ctrl+W', description: 'Close active tab' },
      { keys: 'Ctrl+Shift+W', description: 'Close all tabs' },
      { keys: 'Ctrl+Tab', description: 'Switch to next tab' },
      { keys: 'Ctrl+Shift+Tab', description: 'Switch to previous tab' },
      { keys: 'Ctrl+1 — Ctrl+9', description: 'Jump to tab by position' },
    ],
  },
  {
    heading: 'Actions',
    entries: [
      { keys: 'Ctrl+N', description: 'New query tab (requires active SQL connection)' },
      { keys: 'Ctrl+Shift+K', description: 'Open AI chat panel for active connection' },
    ],
  },
  {
    heading: 'Table Editing',
    entries: [
      { keys: 'Enter', description: 'Confirm cell edit' },
      { keys: 'Escape', description: 'Cancel cell edit' },
    ],
  },
  {
    heading: 'Column Resize',
    entries: [
      { keys: 'Drag', description: 'Drag the right edge of a column header to resize' },
      { keys: 'Enter / Space', description: 'Start resize mode on focused column header' },
    ],
  },
  {
    heading: 'Navigation',
    entries: [
      { keys: 'Enter / Space', description: 'Activate focused row or item' },
      { keys: 'Arrow Up / Down', description: 'Adjust split ratio in Monaco / Mongo editor panels' },
    ],
  },
];

export type TabAction = {
  label: string;
  icon: LucideIcon;
  open: (id: string) => void;
};

export const SQL_TAB_ACTIONS: TabAction[] = [
  { label: 'New Query', icon: FileText, open: openNewQueryTab },
  { label: 'Graph', icon: Share2, open: openGraphTab },
  { label: 'Stats', icon: BarChart3, open: openDatabaseStatsTab },
  { label: 'Schema Timeline', icon: History, open: openSchemaTimelineTab },
  { label: 'Migration Assistant', icon: Terminal, open: openMigrationTab },
];

export const ENGINE_TAB_ACTIONS: Partial<Record<ConnectionProfile['kind'], TabAction[]>> = {
  qdrant: [{ label: 'Vector Search', icon: Search, open: openQdrantSearchTab }],
  sqlite: [{ label: 'Vector Search', icon: Search, open: openSqliteVecSearchTab }],
  mongodb: [
    { label: 'Mongo Shell', icon: Terminal, open: openMongoShellTab },
    {
      label: 'Aggregation',
      icon: Terminal,
      open: (id) => openMongoQueryTab(id, appStore.state.activeMongoDatabase ?? 'admin', ''),
    },
  ],
  redis: [
    { label: 'Query', icon: Terminal, open: openRedisQueryTab },
    { label: 'Stats', icon: BarChart3, open: openRedisTab },
  ],
};
