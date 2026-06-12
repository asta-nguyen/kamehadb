/** How long to cache schema metadata (5 minutes). */
export const SCHEMA_CACHE_TIME = 5 * 60 * 1000;

/** How long to cache database stats (30 seconds). */
export const STATS_CACHE_TIME = 30 * 1000;

import { PostgreSQL, MySQL, Redis, MongoDB, Oracle, MicrosoftSQLServer, ClickHouse } from 'developer-icons';
import type { DbKind } from '@kamehadb/shared';

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

export const GROUP_LABELS: Record<string, string> = {
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
