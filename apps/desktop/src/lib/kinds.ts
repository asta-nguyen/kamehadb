// Frontend engine-kind constants — mirrors internal/engines/kinds.go.
import { KIND as SHARED_KIND, type DbKind } from '@kamehadb/shared';

export const KIND = {
  POSTGRES: SHARED_KIND.POSTGRES,
  MYSQL: SHARED_KIND.MYSQL,
  MARIADB: SHARED_KIND.MARIADB,
  SQLITE: SHARED_KIND.SQLITE,
  SQLSERVER: SHARED_KIND.SQLSERVER,
  ORACLE: SHARED_KIND.ORACLE,
  CLICKHOUSE: SHARED_KIND.CLICKHOUSE,
  DUCKDB: SHARED_KIND.DUCKDB,
  MONGODB: SHARED_KIND.MONGODB,
  REDIS: SHARED_KIND.REDIS,
} as const;

export const ALL_KINDS: readonly DbKind[] = [
  KIND.POSTGRES,
  KIND.MYSQL,
  KIND.MARIADB,
  KIND.SQLITE,
  KIND.SQLSERVER,
  KIND.ORACLE,
  KIND.CLICKHOUSE,
  KIND.DUCKDB,
  KIND.MONGODB,
  KIND.REDIS,
];

export const SQL_KINDS: readonly DbKind[] = [
  KIND.POSTGRES,
  KIND.MYSQL,
  KIND.MARIADB,
  KIND.SQLITE,
  KIND.SQLSERVER,
  KIND.ORACLE,
  KIND.CLICKHOUSE,
  KIND.DUCKDB,
];

export const NOSQL_KINDS: readonly DbKind[] = [KIND.MONGODB, KIND.REDIS];

/** URL protocol aliases that differ from KIND values. */
export const PROTOCOL_ALIASES: Record<string, DbKind> = {
  postgresql: KIND.POSTGRES,
  rediss: KIND.REDIS,
  'mongodb+srv': KIND.MONGODB,
  mssql: KIND.SQLSERVER,
};

/** Default network port for each supported kind (0 = not networked). */
export const DEFAULT_PORTS: Partial<Record<DbKind, number>> = {
  [KIND.POSTGRES]: 5432,
  [KIND.MYSQL]: 3306,
  [KIND.MARIADB]: 3306,
  [KIND.SQLITE]: 0,
  [KIND.SQLSERVER]: 1433,
  [KIND.ORACLE]: 1521,
  [KIND.CLICKHOUSE]: 8123,
  [KIND.DUCKDB]: 0,
  [KIND.MONGODB]: 27017,
  [KIND.REDIS]: 6379,
};

export function isSqlKind(kind: string | undefined): kind is DbKind {
  return kind !== undefined && (SQL_KINDS as readonly string[]).includes(kind);
}

export function isNoSqlKind(kind: string | undefined): kind is DbKind {
  return kind !== undefined && (NOSQL_KINDS as readonly string[]).includes(kind);
}

export const FILE_DATABASE_KINDS: readonly DbKind[] = [KIND.SQLITE, KIND.DUCKDB];

export function isFileDatabaseKind(kind: string | undefined): boolean {
  return kind !== undefined && (FILE_DATABASE_KINDS as readonly string[]).includes(kind);
}
