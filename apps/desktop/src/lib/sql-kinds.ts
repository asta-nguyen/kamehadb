import type { DbKind } from '@kamehadb/shared';

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
