import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import {
  CreateConnectionProfileSchema,
  FileDatabaseBackupRequestSchema,
  FileDatabaseRestoreRequestSchema,
  UpdateConnectionProfileSchema,
} from '@kamehadb/shared';
import * as metadataStore from '../db/metadata-store.js';
import { testPostgresConnection } from '../adapters/postgres.js';
import { testSqliteConnection } from '../adapters/sqlite.js';
import { testMysqlConnection } from '../adapters/mysql.js';
import { testSqlServerConnection } from '../adapters/sqlserver.js';
import { testOracleConnection } from '../adapters/oracle.js';
import { testClickHouseConnection } from '../adapters/clickhouse.js';
import { testDuckDBConnection } from '../adapters/duckdb.js';
import { createMongoAdapter } from '../adapters/mongodb.js';
import { createRedisDbAdapter, createQdrantDbAdapter, createTigerBeetleDbAdapter } from '../adapters/factory.js';
import { testRedisConnection } from '../adapters/redis.js';
import { clearConnectionCache } from '../lib/cache.js';
import {
  backupFileDatabase,
  FileDatabaseMaintenanceError,
  restoreFileDatabase,
} from '../lib/file-database-maintenance.js';
import { invalidateAdapterCache } from './sql.js';
import { log } from '../lib/logger.js';

// Schema for testing connection without requiring a name (use base schema without refinement)
const TestConnectionSchema = z.object({
  kind: z.enum([
    'postgres',
    'sqlite',
    'mysql',
    'mariadb',
    'redis',
    'mongodb',
    'qdrant',
    'sqlserver',
    'oracle',
    'clickhouse',
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
  connectionString: z.string().optional(),
});

export const connectionsRouter = new Hono();

function fileDatabaseErrorResponse(error: unknown): { readonly message: string; readonly statusCode: 400 | 404 | 500 } {
  if (error instanceof FileDatabaseMaintenanceError) {
    return {
      message: error.message,
      statusCode: error.code === 'missing-source-file' ? 404 : 400,
    };
  }
  if (error instanceof Error) {
    return { message: error.message, statusCode: 500 };
  }
  return { message: 'Unknown error', statusCode: 500 };
}

connectionsRouter.get('/', (c) => {
  const profiles = metadataStore.listProfiles();
  return c.json(profiles);
});

// SSE stream: pushes health status for all connections every 30 seconds using
// an async generator. Each event carries a map of connection-id → result.
// The client opens one EventSource instead of polling N individual endpoints.
// NOTE: literal routes must be registered BEFORE /:id to avoid Hono trie conflicts.
connectionsRouter.get('/health', async (c) => {
  const abortController = new AbortController();
  const PER_CHECK_TIMEOUT = 5_000;

  /** Wrap a health check with a per-connection timeout so one hanging
   *  adapter (e.g. TigerBeetle) doesn't block the entire SSE stream. */
  const withTimeout = (promise: Promise<{ success: boolean; message?: string; latencyMs?: number }>, ms: number) =>
    Promise.race([
      promise,
      new Promise<{ success: boolean; message: string; latencyMs?: number }>((resolve) =>
        setTimeout(() => resolve({ success: false, message: `Timeout after ${ms}ms` }), ms),
      ),
    ]);

  const streamHealth = async function* () {
    while (!abortController.signal.aborted) {
      const profiles = metadataStore.listProfiles();
      const results: Record<string, { success: boolean; message?: string; latencyMs?: number }> = {};

      // Run all health checks in parallel so a single slow adapter
      // doesn't block the entire stream.
      await Promise.allSettled(
        profiles.map(async (profile) => {
          const password = metadataStore.getProfilePassword(profile.id);
          try {
            let result: { success: boolean; message?: string; latencyMs?: number };
            const start = performance.now();
            switch (profile.kind) {
              case 'postgres':
                result = await withTimeout(
                  testPostgresConnection({
                    host: profile.host!,
                    port: profile.port!,
                    database: profile.database!,
                    username: profile.username!,
                    password: password ?? '',
                  }),
                  PER_CHECK_TIMEOUT,
                );
                break;
              case 'mongodb':
                result = await withTimeout(
                  createMongoAdapter({
                    connectionString: profile.connectionString!,
                    database: profile.database,
                  }).testConnection(),
                  PER_CHECK_TIMEOUT,
                );
                break;
              case 'redis': {
                const redisDatabaseParsed = profile.database ? parseInt(profile.database, 10) : NaN;
                result = await withTimeout(
                  testRedisConnection({
                    host: profile.host!,
                    port: profile.port!,
                    password: password ?? undefined,
                    database: Number.isNaN(redisDatabaseParsed) ? undefined : redisDatabaseParsed,
                  }),
                  PER_CHECK_TIMEOUT,
                );
                break;
              }
              case 'qdrant':
                result = await withTimeout(createQdrantDbAdapter(profile).testConnection(), PER_CHECK_TIMEOUT);
                break;
              case 'sqlite':
                result = await withTimeout(testSqliteConnection(profile.filePath), PER_CHECK_TIMEOUT);
                break;
              case 'mysql':
              case 'mariadb':
                result = await withTimeout(
                  testMysqlConnection({
                    host: profile.host!,
                    port: profile.port!,
                    database: profile.database,
                    username: profile.username!,
                    password: password ?? '',
                  }),
                  PER_CHECK_TIMEOUT,
                );
                break;
              case 'sqlserver':
                result = await withTimeout(
                  testSqlServerConnection({
                    host: profile.host!,
                    port: profile.port!,
                    database: profile.database,
                    username: profile.username!,
                    password: password ?? '',
                  }),
                  PER_CHECK_TIMEOUT,
                );
                break;
              case 'oracle':
                result = await withTimeout(
                  testOracleConnection({
                    host: profile.host!,
                    port: profile.port!,
                    database: profile.database,
                    username: profile.username!,
                    password: password ?? '',
                  }),
                  PER_CHECK_TIMEOUT,
                );
                break;
              case 'clickhouse':
                result = await withTimeout(
                  testClickHouseConnection({
                    host: profile.host!,
                    port: profile.port!,
                    database: profile.database,
                    username: profile.username!,
                    password: password ?? '',
                  }),
                  PER_CHECK_TIMEOUT,
                );
                break;
              case 'duckdb':
                result = await withTimeout(testDuckDBConnection(profile.filePath!), PER_CHECK_TIMEOUT);
                break;
              case 'tigerbeetle':
                result = await withTimeout(createTigerBeetleDbAdapter(profile).testConnection(), PER_CHECK_TIMEOUT);
                break;
              default:
                result = { success: false, message: `Unsupported: ${profile.kind}` };
            }
            result.latencyMs = Math.round(performance.now() - start);
            results[profile.id] = result;
          } catch (err) {
            log.error({ connectionId: profile.id, err }, 'Connection health check failed');
            results[profile.id] = {
              success: false,
              latencyMs: 0,
              message: err instanceof Error ? err.message : 'Unknown error',
            };
          }
        }),
      );

      yield `data: ${JSON.stringify(results)}\n\n`;

      // Wait 30 seconds before the next round of checks
      await new Promise((resolve) => setTimeout(resolve, 30_000));
    }
  };

  return new Response(
    new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          for await (const chunk of streamHealth()) {
            controller.enqueue(encoder.encode(chunk));
          }
        } finally {
          controller.close();
        }
      },
      cancel() {
        abortController.abort();
      },
    }),
    {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    },
  );
});

// Single-shot health check for manual "reload" action (dropdown menu).
// The SSE /health stream handles automatic 30s updates, but the refresh
// button needs an immediate result.
connectionsRouter.get('/:id/health', async (c) => {
  const connectionId = c.req.param('id');
  const profile = metadataStore.getProfile(connectionId);
  if (!profile) return c.json({ error: 'NOT_FOUND', message: 'Connection not found', statusCode: 404 }, 404);
  const password = metadataStore.getProfilePassword(connectionId);
  try {
    let result;
    switch (profile.kind) {
      case 'postgres':
        result = await testPostgresConnection({
          host: profile.host!,
          port: profile.port!,
          database: profile.database!,
          username: profile.username!,
          password: password ?? '',
        });
        break;
      case 'mongodb':
        result = await createMongoAdapter({
          connectionString: profile.connectionString!,
          database: profile.database,
        }).testConnection();
        break;
      case 'redis':
        const redisDatabaseParsed = profile.database ? parseInt(profile.database, 10) : NaN;
        result = await testRedisConnection({
          host: profile.host,
          port: profile.port,
          password: password ?? undefined,
          database: Number.isNaN(redisDatabaseParsed) ? undefined : redisDatabaseParsed,
        });
        break;
      case 'qdrant':
        result = await createQdrantDbAdapter(profile).testConnection();
        break;
      case 'sqlite':
        result = await testSqliteConnection(profile.filePath);
        break;
      case 'mysql':
      case 'mariadb':
        result = await testMysqlConnection({
          host: profile.host,
          port: profile.port,
          database: profile.database,
          username: profile.username,
          password: password ?? '',
        });
        break;
      case 'sqlserver':
        result = await testSqlServerConnection({
          host: profile.host,
          port: profile.port,
          database: profile.database,
          username: profile.username,
          password: password ?? '',
        });
        break;
      case 'oracle':
        result = await testOracleConnection({
          host: profile.host,
          port: profile.port,
          database: profile.database,
          username: profile.username,
          password: password ?? '',
        });
        break;
      case 'clickhouse':
        result = await testClickHouseConnection({
          host: profile.host,
          port: profile.port,
          database: profile.database,
          username: profile.username,
          password: password ?? '',
        });
        break;
      case 'duckdb':
        result = await testDuckDBConnection(profile.filePath!);
        break;
      case 'tigerbeetle':
        result = await createTigerBeetleDbAdapter(profile).testConnection();
        break;
      default:
        return c.json({ success: false, message: `Unsupported database kind: ${profile.kind}` });
    }
    return c.json(result);
  } catch (err) {
    log.error({ connectionId: c.req.param('id'), err }, 'Test connection failed');
    return c.json({ success: false, message: err instanceof Error ? err.message : 'Unknown error' });
  }
});

connectionsRouter.get('/:id', (c) => {
  const profile = metadataStore.getProfile(c.req.param('id'));
  if (!profile) return c.json({ error: 'NOT_FOUND', message: 'Connection not found', statusCode: 404 }, 404);
  return c.json(profile);
});

connectionsRouter.post('/:id/backup', zValidator('json', FileDatabaseBackupRequestSchema), async (c) => {
  const connectionId = c.req.param('id');
  const profile = metadataStore.getProfile(connectionId);
  if (!profile) return c.json({ error: 'NOT_FOUND', message: 'Connection not found', statusCode: 404 }, 404);

  try {
    invalidateAdapterCache(connectionId);
    const result = await backupFileDatabase(profile, c.req.valid('json'));
    clearConnectionCache(connectionId);
    return c.json(result);
  } catch (error) {
    const response = fileDatabaseErrorResponse(error);
    return c.json({ error: 'FILE_DB_BACKUP_FAILED', message: response.message }, { status: response.statusCode });
  }
});

connectionsRouter.post('/:id/restore', zValidator('json', FileDatabaseRestoreRequestSchema), async (c) => {
  const connectionId = c.req.param('id');
  const profile = metadataStore.getProfile(connectionId);
  if (!profile) return c.json({ error: 'NOT_FOUND', message: 'Connection not found', statusCode: 404 }, 404);

  try {
    invalidateAdapterCache(connectionId);
    const result = await restoreFileDatabase(profile, c.req.valid('json'));
    clearConnectionCache(connectionId);
    return c.json(result);
  } catch (error) {
    const response = fileDatabaseErrorResponse(error);
    return c.json({ error: 'FILE_DB_RESTORE_FAILED', message: response.message }, { status: response.statusCode });
  }
});

connectionsRouter.post('/', zValidator('json', CreateConnectionProfileSchema), async (c) => {
  const input = c.req.valid('json');
  const profile = metadataStore.createProfile(input);
  return c.json(profile, 201);
});

connectionsRouter.patch('/:id', zValidator('json', UpdateConnectionProfileSchema), async (c) => {
  const id = c.req.param('id');
  const profile = metadataStore.updateProfile(id, c.req.valid('json'));
  if (!profile) return c.json({ error: 'NOT_FOUND', message: 'Connection not found', statusCode: 404 }, 404);
  clearConnectionCache(id);
  invalidateAdapterCache(id);
  return c.json(profile);
});

connectionsRouter.delete('/:id', (c) => {
  const id = c.req.param('id');
  const deleted = metadataStore.deleteProfile(id);
  if (!deleted) return c.json({ error: 'NOT_FOUND', message: 'Connection not found', statusCode: 404 }, 404);
  clearConnectionCache(id);
  invalidateAdapterCache(id);
  return c.body(null, 204);
});

connectionsRouter.post('/test', zValidator('json', TestConnectionSchema), async (c) => {
  const input = c.req.valid('json');

  // Validate password is provided for postgres
  if (input.kind === 'postgres' && !input.password) {
    return c.json({
      success: false,
      message: 'Password is required for PostgreSQL connections',
    });
  }

  // Validate required fields for mysql / mariadb
  if (input.kind === 'mysql' || input.kind === 'mariadb') {
    if (!input.password) {
      return c.json({
        success: false,
        message: 'Password is required for MySQL/MariaDB connections',
      });
    }
    if (!input.username) {
      return c.json({
        success: false,
        message: 'Username is required for MySQL/MariaDB connections',
      });
    }
  }

  try {
    let result;
    switch (input.kind) {
      case 'postgres':
        result = await testPostgresConnection(input);
        break;
      case 'mysql':
      case 'mariadb':
        result = await testMysqlConnection({
          host: input.host,
          port: input.port,
          database: input.database,
          username: input.username,
          password: input.password,
        });
        break;
      case 'sqlite':
        result = await testSqliteConnection(input.filePath);
        break;
      case 'mongodb':
        if (!input.connectionString) {
          return c.json({
            success: false,
            message: 'Connection string is required for MongoDB connections',
          });
        }
        result = await createMongoAdapter({
          connectionString: input.connectionString,
          database: input.database,
        }).testConnection();
        break;
      case 'redis':
        result = await createRedisDbAdapter(input, input.password).testConnection();
        break;
      case 'qdrant':
        result = await createQdrantDbAdapter(input).testConnection();
        break;
      case 'sqlserver':
        result = await testSqlServerConnection({
          host: input.host,
          port: input.port,
          database: input.database,
          username: input.username,
          password: input.password,
        });
        break;
      case 'oracle':
        result = await testOracleConnection({
          host: input.host,
          port: input.port,
          database: input.database,
          username: input.username,
          password: input.password,
        });
        break;
      case 'clickhouse':
        result = await testClickHouseConnection({
          host: input.host,
          port: input.port,
          database: input.database,
          username: input.username,
          password: input.password,
        });
        break;
      case 'duckdb':
        if (!input.filePath) {
          return c.json({ success: false, message: 'File path is required for DuckDB connections' });
        }
        result = await testDuckDBConnection(input.filePath);
        break;
      case 'tigerbeetle':
        result = await createTigerBeetleDbAdapter(input).testConnection();
        break;
      default:
        return c.json({ success: false, message: `Unsupported database kind: ${input.kind}` });
    }
    return c.json(result);
  } catch (err) {
    log.error({ err }, 'Test connection (create) failed');
    return c.json({
      success: false,
      message: err instanceof Error ? err.message : 'Unknown error',
    });
  }
});
