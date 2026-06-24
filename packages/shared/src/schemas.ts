import { z } from 'zod';

// Database kind
export const KIND = {
  POSTGRES: 'postgres',
  SQLITE: 'sqlite',
  MYSQL: 'mysql',
  REDIS: 'redis',
  MONGODB: 'mongodb',
  QDRANT: 'qdrant',
  SQLSERVER: 'sqlserver',
  ORACLE: 'oracle',
  CLICKHOUSE: 'clickhouse',
  MARIADB: 'mariadb',
  DUCKDB: 'duckdb',
  TIGERBEETLE: 'tigerbeetle',
} as const;

export type DbKind = (typeof KIND)[keyof typeof KIND];

export const ALL_KINDS: readonly DbKind[] = [
  KIND.POSTGRES,
  KIND.SQLITE,
  KIND.MYSQL,
  KIND.REDIS,
  KIND.MONGODB,
  KIND.QDRANT,
  KIND.SQLSERVER,
  KIND.ORACLE,
  KIND.CLICKHOUSE,
  KIND.MARIADB,
  KIND.DUCKDB,
  KIND.TIGERBEETLE,
];

export const SQL_KINDS: readonly DbKind[] = [
  KIND.POSTGRES,
  KIND.MYSQL,
  KIND.SQLITE,
  KIND.SQLSERVER,
  KIND.ORACLE,
  KIND.CLICKHOUSE,
  KIND.MARIADB,
  KIND.DUCKDB,
];

export const NOSQL_KINDS: readonly DbKind[] = [KIND.REDIS, KIND.MONGODB, KIND.QDRANT, KIND.TIGERBEETLE];

export function isSqlKind(kind: string): kind is DbKind {
  return (SQL_KINDS as readonly string[]).includes(kind);
}

export function isNoSqlKind(kind: string): kind is DbKind {
  return (NOSQL_KINDS as readonly string[]).includes(kind);
}

export const FILE_DATABASE_KINDS = [KIND.SQLITE, KIND.DUCKDB] as const;
export type FileDatabaseKind = (typeof FILE_DATABASE_KINDS)[number];

export function isFileDatabaseKind(kind: DbKind): kind is FileDatabaseKind {
  return FILE_DATABASE_KINDS.some((candidate) => candidate === kind);
}

/** Default network port for each database kind (0 = not networked). */
export const DEFAULT_PORTS: Record<DbKind, number> = {
  [KIND.POSTGRES]: 5432,
  [KIND.MYSQL]: 3306,
  [KIND.SQLITE]: 0,
  [KIND.REDIS]: 6379,
  [KIND.MONGODB]: 0,
  [KIND.QDRANT]: 6333,
  [KIND.SQLSERVER]: 1433,
  [KIND.ORACLE]: 1521,
  [KIND.CLICKHOUSE]: 8123,
  [KIND.MARIADB]: 3306,
  [KIND.DUCKDB]: 0,
  [KIND.TIGERBEETLE]: 3000,
};

/** SQL migration dialect names. */
export const DIALECT = {
  POSTGRESQL: 'postgresql',
  MYSQL: 'mysql',
  SQLITE: 'sqlite',
  SQLSERVER: 'sqlserver',
  ORACLE: 'oracle',
  CLICKHOUSE: 'clickhouse',
  DUCKDB: 'duckdb',
} as const;

export const DEFAULT_DIALECT = DIALECT.POSTGRESQL;

/** Maps a DbKind to its SQL migration dialect. Non-SQL kinds default to 'postgresql'. */
export const DIALECT_BY_KIND: Record<DbKind, string> = {
  [KIND.POSTGRES]: DIALECT.POSTGRESQL,
  [KIND.MYSQL]: DIALECT.MYSQL,
  [KIND.MARIADB]: DIALECT.MYSQL,
  [KIND.SQLITE]: DIALECT.SQLITE,
  [KIND.SQLSERVER]: DIALECT.SQLSERVER,
  [KIND.ORACLE]: DIALECT.ORACLE,
  [KIND.CLICKHOUSE]: DIALECT.CLICKHOUSE,
  [KIND.DUCKDB]: DIALECT.DUCKDB,
  [KIND.REDIS]: DEFAULT_DIALECT,
  [KIND.MONGODB]: DEFAULT_DIALECT,
  [KIND.QDRANT]: DEFAULT_DIALECT,
  [KIND.TIGERBEETLE]: DEFAULT_DIALECT,
};

export function resolveDialect(kind: DbKind): string {
  return DIALECT_BY_KIND[kind] ?? DEFAULT_DIALECT;
}

// Connection profile (without secret)
export type ConnectionProfile = {
  id: string;
  name: string;
  kind: DbKind;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  ssl?: boolean;
  filePath?: string;
  color?: string;
  connectionString?: string;
  createdAt: string;
  updatedAt: string;
};

// Connection profile input (for create/update, without id/timestamps)
const BaseCreateSchema = z.object({
  name: z.string().min(1),
  kind: z.enum(ALL_KINDS as [string, ...string[]]),
  host: z.string().optional(),
  port: z.number().int().positive().optional(),
  database: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  ssl: z.boolean().optional(),
  filePath: z.string().optional(),
  color: z.string().optional(),
  connectionString: z.string().optional(),
});

export const CreateConnectionProfileSchema = BaseCreateSchema.refine(
  (data) => {
    if (data.kind === KIND.POSTGRES && !data.password) {
      return false;
    }
    if (data.kind === KIND.MONGODB && !data.connectionString) {
      return false;
    }
    if ((data.kind === KIND.SQLITE || data.kind === KIND.DUCKDB) && !data.filePath) {
      return false;
    }
    return true;
  },
  (data) => {
    if (data.kind === KIND.MONGODB && !data.connectionString) {
      return {
        message: 'Connection string is required for MongoDB connections',
        path: ['connectionString'],
      };
    }
    if ((data.kind === KIND.SQLITE || data.kind === KIND.DUCKDB) && !data.filePath) {
      return {
        message: 'Database file path is required for SQLite/DuckDB connections',
        path: ['filePath'],
      };
    }
    return {
      message: 'Password is required for PostgreSQL connections',
      path: ['password'],
    };
  },
);
export type CreateConnectionProfileInput = z.infer<typeof CreateConnectionProfileSchema>;

export const EditConnectionProfileSchema = BaseCreateSchema.refine(
  (data) => {
    if (data.kind === KIND.MONGODB && !data.connectionString) {
      return false;
    }
    if ((data.kind === KIND.SQLITE || data.kind === KIND.DUCKDB) && !data.filePath) {
      return false;
    }
    return true;
  },
  (data) => {
    if (data.kind === KIND.MONGODB && !data.connectionString) {
      return {
        message: 'Connection string is required for MongoDB connections',
        path: ['connectionString'],
      };
    }
    if ((data.kind === KIND.SQLITE || data.kind === KIND.DUCKDB) && !data.filePath) {
      return {
        message: 'Database file path is required for SQLite/DuckDB connections',
        path: ['filePath'],
      };
    }
    return { message: 'Invalid connection', path: [] };
  },
);
export type EditConnectionProfileInput = z.infer<typeof EditConnectionProfileSchema>;

export const UpdateConnectionProfileSchema = BaseCreateSchema.partial();
export type UpdateConnectionProfileInput = z.infer<typeof UpdateConnectionProfileSchema>;

export const FileDatabaseBackupRequestSchema = z.object({
  outputPath: z.string().min(1),
});
export type FileDatabaseBackupRequest = z.infer<typeof FileDatabaseBackupRequestSchema>;

export const FileDatabaseRestoreRequestSchema = z.object({
  inputPath: z.string().min(1),
});
export type FileDatabaseRestoreRequest = z.infer<typeof FileDatabaseRestoreRequestSchema>;

export type FileDatabaseMaintenanceResult = {
  path: string;
  relatedPaths: string[];
};

// Query history
export const SaveQueryHistorySchema = z.object({
  query: z.string().min(1),
  durationMs: z.number().optional(),
  rowCount: z.number().optional(),
});
export type SaveQueryHistoryInput = z.infer<typeof SaveQueryHistorySchema>;

export const UpdateQueryHistorySchema = z.object({
  favorite: z.boolean().optional(),
  name: z.string().optional(),
});
export type UpdateQueryHistoryInput = z.infer<typeof UpdateQueryHistorySchema>;
