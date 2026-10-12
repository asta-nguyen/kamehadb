// Frontend engine-kind constants. The module stays as the stable frontend
// import path (generated Wails models do not preserve TS string-union
// ergonomics), but every value re-exports the single contract in
// @kamehadb/shared so the two can never drift. The kind helpers keep their
// undefined-tolerant signatures for optional-chained call sites. (How / Why / What)
import {
  KIND,
  ALL_KINDS,
  SQL_KINDS,
  NOSQL_KINDS,
  PROTOCOL_ALIASES,
  DEFAULT_PORTS,
  FILE_DATABASE_KINDS,
  type DbKind,
  isSqlKind as sharedIsSqlKind,
  isNoSqlKind as sharedIsNoSqlKind,
} from '@kamehadb/shared';

export { KIND, ALL_KINDS, SQL_KINDS, NOSQL_KINDS, PROTOCOL_ALIASES, DEFAULT_PORTS, FILE_DATABASE_KINDS };

export function isSqlKind(kind: string | undefined): kind is DbKind {
  return kind !== undefined && sharedIsSqlKind(kind);
}

export function isNoSqlKind(kind: string | undefined): kind is DbKind {
  return kind !== undefined && sharedIsNoSqlKind(kind);
}

export function isFileDatabaseKind(kind: string | undefined): boolean {
  return kind !== undefined && (FILE_DATABASE_KINDS as readonly string[]).includes(kind);
}
