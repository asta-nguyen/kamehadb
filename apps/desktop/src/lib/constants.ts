import {
  SCHEMA_CACHE_TIME as SHARED_SCHEMA_CACHE_TIME,
  STATS_CACHE_TIME as SHARED_STATS_CACHE_TIME,
} from '@kamehadb/shared';

export const PAGE_LIMIT = 20;

export const SCHEMA_CACHE_TIME = SHARED_SCHEMA_CACHE_TIME;
export const STATS_CACHE_TIME = SHARED_STATS_CACHE_TIME;

// Query cache garbage collection and stale times to minimize heap usage. (How / Why / What)
export const DEFAULT_QUERY_GC_TIME_MS = 60 * 1000;
export const DEFAULT_QUERY_STALE_TIME_MS = 15 * 1000;
// Visible SQL results belong to their editor; don't retain a second mutation copy after unmount.
export const SQL_RESULT_GC_TIME_MS = 0;
// Open tabs retain previews only under the workspace owner's byte budget.
export const PREVIEW_RESULT_GC_TIME_MS = Infinity;
export const PREVIEW_CACHE_BYTES = 32 * 1024 * 1024;
export const MAX_PREVIEW_BOOKMARKS = 100;
export const PREVIEW_STRING_STORAGE_FACTOR = 2;
export const PREVIEW_HEAP_BYTES_PER_ROW = 128;

export const TOAST_AUTO_HIDE_MS = 5 * 1000;
export const AUTO_TEST_DEBOUNCE_MS = 500;
// Native-style overlay bars fade when idle; this is that idle delay. (Why)
export const SCROLLBAR_AUTO_HIDE_MS = 2 * 1000;
// Delay before the table view shows its refetch spinner, so fast sorts and
// cached page loads do not flash a loading indicator. (Why)
export const SLOW_FETCH_INDICATOR_DELAY_MS = 250;

// Update check interval and cache settings (periodic background check). (Why)
export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const UPDATE_CHECK_TIMEOUT_MS = 8 * 1000;
export const UPDATE_CACHE_STORAGE_KEY = 'kamehadb_update_cache';
export const UPDATE_SETTINGS_STORAGE_KEY = 'kamehadb_check_for_updates';
export const UPDATE_DISMISSED_VERSION_KEY = 'kamehadb_dismissed_update_version';
export const DEMO_PREVIEW_STORAGE_KEY = 'kamehadb_preview_update';
export const GITHUB_RELEASES_API_URL = 'https://api.github.com/repos/asta-nguyen/kamehadb/releases/latest';
export const KOFI_URL = 'https://ko-fi.com/n2q1910';

import { PostgreSQL, MySQL, Redis, MongoDB, Oracle, MicrosoftSQLServer, ClickHouse } from 'developer-icons';
import type { DbKind } from '@kamehadb/shared';
import { KIND, ALL_KINDS, SQL_KINDS, isSqlKind, DEFAULT_PORTS } from './kinds';
import { FileText, History, BarChart3, Share2, Terminal, type LucideIcon } from 'lucide-react';
import {
  openNewQueryTab,
  openGraphTab,
  openDatabaseStatsTab,
  openSchemaTimelineTab,
  openMongoQueryTab,
  openMongoShellTab,
  openRedisQueryTab,
  openRedisTab,
  appStore,
} from '@/store';
import type { ConnectionProfile } from '@kamehadb/shared';

export const KIND_ICON_COMPONENT: Partial<Record<DbKind, React.ComponentType<React.SVGProps<SVGSVGElement>>>> = {
  [KIND.POSTGRES]: PostgreSQL,
  [KIND.MYSQL]: MySQL,
  [KIND.SQLITE]: MySQL,
  [KIND.REDIS]: Redis,
  [KIND.MONGODB]: MongoDB,
  [KIND.SQLSERVER]: MicrosoftSQLServer,
  [KIND.ORACLE]: Oracle,
  [KIND.CLICKHOUSE]: ClickHouse,
  [KIND.MARIADB]: MySQL,
  [KIND.DUCKDB]: PostgreSQL,
};

export const GROUP_ORDER: Record<string, number> = {
  [KIND.POSTGRES]: 0,
  [KIND.MYSQL]: 1,
  [KIND.SQLITE]: 2,
  [KIND.REDIS]: 3,
  [KIND.MONGODB]: 4,
  [KIND.SQLSERVER]: 5,
  [KIND.ORACLE]: 6,
  [KIND.CLICKHOUSE]: 7,
  [KIND.MARIADB]: 8,
  [KIND.DUCKDB]: 9,
};

export const KIND_LABELS: Partial<Record<DbKind, string>> = {
  [KIND.POSTGRES]: 'PostgreSQL',
  [KIND.SQLITE]: 'SQLite',
  [KIND.MYSQL]: 'MySQL',
  [KIND.REDIS]: 'Redis',
  [KIND.MONGODB]: 'MongoDB',
  [KIND.SQLSERVER]: 'SQL Server',
  [KIND.ORACLE]: 'Oracle',
  [KIND.CLICKHOUSE]: 'ClickHouse',
  [KIND.MARIADB]: 'MariaDB',
  [KIND.DUCKDB]: 'DuckDB',
};

// Alias for GROUP_LABELS to match semantic usage — labels by engine kind are the
// same regardless of whether they appear as group headers or individual badges.
export const GROUP_LABELS = KIND_LABELS;

export const SIDEBAR_MIN_WIDTH = 250;
export const SIDEBAR_MAX_WIDTH = 400;
export const SIDEBAR_DEFAULT_WIDTH = 300;

export const KINDS: DbKind[] = [...ALL_KINDS];

export const SSL_KINDS: readonly DbKind[] = [KIND.POSTGRES, KIND.MYSQL, KIND.MARIADB, KIND.SQLSERVER];

/** Engine kinds that use the SQL adapter path (not Mongo/Redis). */
export { SQL_KINDS, isSqlKind, DEFAULT_PORTS };

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

export const GREETINGS = [
  'Ready to review your data?',
  "Let's see what's new in the database.",
  'Start with fresh insights.',
  "Data looks good—what's first?",
  'Any updates to review today?',
  "Let's dive into the tables.",
  'Review your latest entries.',
  "Here's the overview.",
  'Data updates are waiting—ready to explore?',
  'Any new records to inspect?',
  "Let's finish today's data review.",
  'All tables up to date.',
  "Time to wrap up today's database tasks.",
  'See what changed today.',
  'Check the last updates before closing.',
  'Quiet time—check your data.',
  'Inspect your tables calmly.',
  'Last changes of the day.',
  'Take a look before logging off.',
  "See today's records at a glance.",
] as const;

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
      { keys: 'Ctrl+Shift+F', description: 'Open Federated Query tab (union across SQL connections)' },
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
      { keys: 'Arrow Up / Down', description: 'Adjust split ratio in SQL / Mongo editor panels' },
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
];

export const ENGINE_TAB_ACTIONS: Partial<Record<ConnectionProfile['kind'], TabAction[]>> = {
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

import type { AiSchemaAction } from '@kamehadb/shared';
import { Sparkles, Beaker, KeyRound } from 'lucide-react';

/** Schema-tree right-click AI action definitions. Each action has a menu label,
 * a lucide icon, and a prompt template that takes the qualified table name
 * (schema.table) and returns the user message sent to the AI chat. The table
 * DDL is injected separately by the backend via the tableId on the chat request. */
export const AI_SCHEMA_ACTIONS: Record<
  AiSchemaAction,
  { label: string; icon: LucideIcon; buildPrompt: (qualifiedTable: string) => string }
> = {
  'explain-schema': {
    label: 'Explain this schema',
    icon: Sparkles,
    buildPrompt: (table) =>
      `Explain the structure and purpose of the table ${table}. Describe each column, its type, primary and foreign keys, and any notable constraints or relationships.`,
  },
  'generate-test-data': {
    label: 'Generate test data',
    icon: Beaker,
    buildPrompt: (table) =>
      `Generate realistic test data for the table ${table}. Produce INSERT statements that respect column types, NOT NULL constraints, primary keys, and foreign key relationships. Provide 5 rows.`,
  },
  'suggest-index': {
    label: 'Suggest index',
    icon: KeyRound,
    buildPrompt: (table) =>
      `Suggest indexes for the table ${table} based on its columns and existing indexes. Explain the rationale for each suggestion and provide the CREATE INDEX statements.`,
  },
};

/** Order in which AI actions appear in the context menu. */
export const AI_SCHEMA_ACTION_ORDER: readonly AiSchemaAction[] = [
  'explain-schema',
  'generate-test-data',
  'suggest-index',
];

/** Maximum number of slow-query patterns to show in the Slow queries tab.
 * Named constant per AGENTS.md rule 6 (no magic numbers). */
export const TOP_N_SLOW_QUERIES = 10;

/** Context passed to a slow-query AI prompt template: the normalized pattern,
 * the most recent raw query sample, the p95 duration, and the call count. */
export type SlowQueryPromptContext = {
  pattern: string;
  sampleQuery: string;
  p95: number;
  count: number;
};

/** Slow-query AI actions. Each row in the Slow queries tab exposes two
 * buttons ("Suggest index" and "Explain") that pre-seed the AI chat via the
 * existing pendingAiPrompt store field (reused from Phase 4). No tableId is
 * set because a slow query is not table-scoped; the backend falls back to
 * full-schema DDL context. */
export const SLOW_QUERY_AI_ACTIONS: Record<
  'suggest-index' | 'explain',
  { label: string; icon: LucideIcon; buildPrompt: (ctx: SlowQueryPromptContext) => string }
> = {
  'suggest-index': {
    label: 'Suggest index',
    icon: KeyRound,
    buildPrompt: (ctx) =>
      `Suggest indexes to speed up this slow query (p95 ${ctx.p95}ms, run ${ctx.count} times):\n\n\`\`\`sql\n${ctx.sampleQuery}\n\`\`\`\n\nExplain the rationale for each suggestion and provide the CREATE INDEX statements.`,
  },
  explain: {
    label: 'Explain',
    icon: Sparkles,
    buildPrompt: (ctx) =>
      `Explain why this query is slow (p95 ${ctx.p95}ms, run ${ctx.count} times) and suggest optimizations:\n\n\`\`\`sql\n${ctx.sampleQuery}\n\`\`\``,
  },
};

/** Order in which slow-query AI action buttons appear on a row. */
export const SLOW_QUERY_AI_ACTION_ORDER: readonly ('suggest-index' | 'explain')[] = ['suggest-index', 'explain'];
