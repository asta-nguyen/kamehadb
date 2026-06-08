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
