import { z } from 'zod';

// Database kind
export type DbKind =
  | 'postgres'
  | 'sqlite'
  | 'mysql'
  | 'redis'
  | 'mongodb'
  | 'qdrant'
  | 'sqlserver'
  | 'oracle'
  | 'clickhouse'
  | 'mariadb'
  | 'duckdb'
  | 'tigerbeetle';

export const FILE_DATABASE_KINDS = ['sqlite', 'duckdb'] as const;
export type FileDatabaseKind = (typeof FILE_DATABASE_KINDS)[number];

export function isFileDatabaseKind(kind: DbKind): kind is FileDatabaseKind {
  return FILE_DATABASE_KINDS.some((candidate) => candidate === kind);
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
  kind: z.enum([
    'postgres',
    'sqlite',
    'mysql',
    'redis',
    'mongodb',
    'qdrant',
    'sqlserver',
    'oracle',
    'clickhouse',
    'mariadb',
    'duckdb',
    'tigerbeetle',
  ]),
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
    if (data.kind === 'postgres' && !data.password) {
      return false;
    }
    if (data.kind === 'mongodb' && !data.connectionString) {
      return false;
    }
    if ((data.kind === 'sqlite' || data.kind === 'duckdb') && !data.filePath) {
      return false;
    }
    return true;
  },
  (data) => {
    if (data.kind === 'mongodb' && !data.connectionString) {
      return {
        message: 'Connection string is required for MongoDB connections',
        path: ['connectionString'],
      };
    }
    if ((data.kind === 'sqlite' || data.kind === 'duckdb') && !data.filePath) {
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
    if (data.kind === 'mongodb' && !data.connectionString) {
      return false;
    }
    if ((data.kind === 'sqlite' || data.kind === 'duckdb') && !data.filePath) {
      return false;
    }
    return true;
  },
  (data) => {
    if (data.kind === 'mongodb' && !data.connectionString) {
      return {
        message: 'Connection string is required for MongoDB connections',
        path: ['connectionString'],
      };
    }
    if ((data.kind === 'sqlite' || data.kind === 'duckdb') && !data.filePath) {
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
