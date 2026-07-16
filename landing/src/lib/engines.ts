// Vendored canonical engine list — manually synced with packages/shared/src/schemas.ts.
// landing/ is NOT in the pnpm workspace, so @kamehadb/shared cannot be imported here.
// Kind values MUST match KIND.* exactly. Update this file when the shared engine list changes.

export type EngineType = 'sql' | 'document' | 'cache' | 'vector' | 'ledger';

export type EngineFeature = {
  label: string;
  supported: boolean;
};

export type EngineInfo = {
  /** Matches KIND.* from packages/shared/src/schemas.ts */
  kind: string;
  label: string;
  type: EngineType;
  port: number;
  dockerImage: string;
  dockerSnippet: string;
  features: EngineFeature[];
};

export const ENGINE_TYPE_LABELS: Record<EngineType, string> = {
  sql: 'SQL',
  document: 'Document',
  cache: 'Cache',
  vector: 'Vector',
  ledger: 'Ledger',
};

export const ENGINE_TYPE_FILTERS: EngineType[] = ['sql', 'document', 'cache', 'vector', 'ledger'];

// Color classes for each engine type badge — matches the provider badge pattern in home-view.
export const ENGINE_TYPE_COLORS: Record<EngineType, string> = {
  sql: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  document: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  cache: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
  vector: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
  ledger: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
};

// 12 engines — mirrors ALL_KINDS from packages/shared/src/schemas.ts.
// Docker snippets use the connection defaults from AGENTS.md.
export const ENGINES: EngineInfo[] = [
  {
    kind: 'postgres',
    label: 'PostgreSQL',
    type: 'sql',
    port: 5432,
    dockerImage: 'postgres:16',
    dockerSnippet:
      'docker run -d --name kameha-pg \\\n  -e POSTGRES_USER=kameha \\\n  -e POSTGRES_PASSWORD=kameha \\\n  -e POSTGRES_DB=kamehadb \\\n  -p 5432:5432 postgres:16',
    features: [
      { label: 'Schema browsing', supported: true },
      { label: 'SQL editor', supported: true },
      { label: 'AI chat', supported: true },
      { label: 'Schema timeline', supported: true },
      { label: 'Stats views', supported: true },
      { label: 'Backup / restore', supported: true },
      { label: 'pgvector', supported: true },
      { label: 'Embedded psql', supported: true },
    ],
  },
  {
    kind: 'mysql',
    label: 'MySQL',
    type: 'sql',
    port: 3306,
    dockerImage: 'mysql:8',
    dockerSnippet:
      'docker run -d --name kameha-mysql \\\n  -e MYSQL_ROOT_PASSWORD=kameha \\\n  -e MYSQL_USER=kameha \\\n  -e MYSQL_PASSWORD=kameha \\\n  -e MYSQL_DATABASE=kamehadb \\\n  -p 3306:3306 mysql:8',
    features: [
      { label: 'Schema browsing', supported: true },
      { label: 'SQL editor', supported: true },
      { label: 'AI chat', supported: true },
      { label: 'Schema timeline', supported: true },
      { label: 'Stats views', supported: true },
      { label: 'Backup / restore', supported: false },
      { label: 'pgvector', supported: false },
      { label: 'Embedded shell', supported: false },
    ],
  },
  {
    kind: 'mariadb',
    label: 'MariaDB',
    type: 'sql',
    port: 3307,
    dockerImage: 'mariadb:11',
    dockerSnippet:
      'docker run -d --name kameha-mariadb \\\n  -e MARIADB_ROOT_PASSWORD=kameha \\\n  -e MARIADB_USER=kameha \\\n  -e MARIADB_PASSWORD=kameha \\\n  -e MARIADB_DATABASE=kamehadb \\\n  -p 3307:3306 mariadb:11',
    features: [
      { label: 'Schema browsing', supported: true },
      { label: 'SQL editor', supported: true },
      { label: 'AI chat', supported: true },
      { label: 'Schema timeline', supported: true },
      { label: 'Stats views', supported: true },
      { label: 'Backup / restore', supported: false },
      { label: 'pgvector', supported: false },
      { label: 'Embedded shell', supported: false },
    ],
  },
  {
    kind: 'sqlite',
    label: 'SQLite',
    type: 'sql',
    port: 0,
    dockerImage: '—',
    dockerSnippet:
      '# SQLite is file-based — no Docker needed\n# Create or open a database file:\nsqlite3 ./my-database.db',
    features: [
      { label: 'Schema browsing', supported: true },
      { label: 'SQL editor', supported: true },
      { label: 'AI chat', supported: true },
      { label: 'Schema timeline', supported: true },
      { label: 'Stats views', supported: true },
      { label: 'Backup / restore', supported: true },
      { label: 'sqlite-vec', supported: true },
      { label: 'Embedded shell', supported: false },
    ],
  },
  {
    kind: 'sqlserver',
    label: 'SQL Server',
    type: 'sql',
    port: 1433,
    dockerImage: 'mcr.microsoft.com/mssql/server:2022-latest',
    dockerSnippet:
      'docker run -d --name kameha-sqlserver \\\n  -e ACCEPT_EULA=Y \\\n  -e MSSQL_SA_PASSWORD=Kameha1! \\\n  -p 1433:1433 \\\n  mcr.microsoft.com/mssql/server:2022-latest',
    features: [
      { label: 'Schema browsing', supported: true },
      { label: 'SQL editor', supported: true },
      { label: 'AI chat', supported: true },
      { label: 'Schema timeline', supported: true },
      { label: 'Stats views', supported: true },
      { label: 'Backup / restore', supported: false },
      { label: 'pgvector', supported: false },
      { label: 'Embedded shell', supported: false },
    ],
  },
  {
    kind: 'oracle',
    label: 'Oracle',
    type: 'sql',
    port: 1521,
    dockerImage: 'gvenzl/oracle-xe:21',
    dockerSnippet:
      'docker run -d --name kameha-oracle \\\n  -e ORACLE_PASSWORD=oracle \\\n  -p 1521:1521 gvenzl/oracle-xe:21',
    features: [
      { label: 'Schema browsing', supported: true },
      { label: 'SQL editor', supported: true },
      { label: 'AI chat', supported: true },
      { label: 'Schema timeline', supported: true },
      { label: 'Stats views', supported: true },
      { label: 'Backup / restore', supported: false },
      { label: 'pgvector', supported: false },
      { label: 'Embedded shell', supported: false },
    ],
  },
  {
    kind: 'clickhouse',
    label: 'ClickHouse',
    type: 'sql',
    port: 8123,
    dockerImage: 'clickhouse/clickhouse-server:24',
    dockerSnippet:
      'docker run -d --name kameha-clickhouse \\\n  -e CLICKHOUSE_USER=default \\\n  -e CLICKHOUSE_PASSWORD=default \\\n  -e CLICKHOUSE_DB=kamehadb \\\n  -p 8123:8123 -p 9000:9000 \\\n  clickhouse/clickhouse-server:24',
    features: [
      { label: 'Schema browsing', supported: true },
      { label: 'SQL editor', supported: true },
      { label: 'AI chat', supported: true },
      { label: 'Schema timeline', supported: true },
      { label: 'Stats views', supported: true },
      { label: 'Backup / restore', supported: false },
      { label: 'pgvector', supported: false },
      { label: 'Embedded shell', supported: false },
    ],
  },
  {
    kind: 'duckdb',
    label: 'DuckDB',
    type: 'sql',
    port: 0,
    dockerImage: '—',
    dockerSnippet:
      '# DuckDB is file-based — no Docker needed\n# Create or open a database file:\nduckdb ./my-database.duckdb',
    features: [
      { label: 'Schema browsing', supported: true },
      { label: 'SQL editor', supported: true },
      { label: 'AI chat', supported: true },
      { label: 'Schema timeline', supported: true },
      { label: 'Stats views', supported: true },
      { label: 'Backup / restore', supported: true },
      { label: 'pgvector', supported: false },
      { label: 'Embedded shell', supported: false },
    ],
  },
  {
    kind: 'mongodb',
    label: 'MongoDB',
    type: 'document',
    port: 27017,
    dockerImage: 'mongo:7',
    dockerSnippet: 'docker run -d --name kameha-mongo \\\n  -p 27017:27017 mongo:7',
    features: [
      { label: 'Collection browsing', supported: true },
      { label: 'Aggregation editor', supported: true },
      { label: 'AI chat', supported: true },
      { label: 'Document editing', supported: true },
      { label: 'Chart view', supported: true },
      { label: 'Embedded mongosh', supported: true },
      { label: 'Stats views', supported: true },
      { label: 'Schema timeline', supported: false },
    ],
  },
  {
    kind: 'redis',
    label: 'Redis',
    type: 'cache',
    port: 6379,
    dockerImage: 'redis:7',
    dockerSnippet: 'docker run -d --name kameha-redis \\\n  -p 6379:6379 redis:7',
    features: [
      { label: 'Key browser', supported: true },
      { label: 'TTL lookup', supported: true },
      { label: 'AI chat', supported: true },
      { label: 'Query terminal', supported: true },
      { label: 'Stats views', supported: true },
      { label: 'Schema timeline', supported: false },
      { label: 'Document editing', supported: false },
      { label: 'Embedded shell', supported: false },
    ],
  },
  {
    kind: 'qdrant',
    label: 'Qdrant',
    type: 'vector',
    port: 6333,
    dockerImage: 'qdrant/qdrant:v1.13.6',
    dockerSnippet: 'docker run -d --name kameha-qdrant \\\n  -p 6333:6333 -p 6334:6334 \\\n  qdrant/qdrant:v1.13.6',
    features: [
      { label: 'Collection browsing', supported: true },
      { label: 'Vector search', supported: true },
      { label: 'AI chat', supported: true },
      { label: '3D vector map', supported: true },
      { label: 'Recommend search', supported: true },
      { label: 'Stats views', supported: true },
      { label: 'Schema timeline', supported: false },
      { label: 'Embedded shell', supported: false },
    ],
  },
  {
    kind: 'tigerbeetle',
    label: 'TigerBeetle',
    type: 'ledger',
    port: 3001,
    dockerImage: 'ghcr.io/tigerbeetle/tigerbeetle:0.16.3',
    dockerSnippet:
      '# TigerBeetle auto-formats on first start\ndocker run -d --name kameha-tb \\\n  -p 3001:3001 \\\n  ghcr.io/tigerbeetle/tigerbeetle:0.16.3',
    features: [
      { label: 'Account explorer', supported: true },
      { label: 'Transfer browser', supported: true },
      { label: 'Balance views', supported: true },
      { label: 'AI chat', supported: true },
      { label: 'Stats views', supported: true },
      { label: 'Schema timeline', supported: false },
      { label: 'Vector search', supported: false },
      { label: 'Embedded shell', supported: false },
    ],
  },
];
