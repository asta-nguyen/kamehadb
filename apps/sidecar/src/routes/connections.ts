import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import {
  ALL_KINDS,
  type DbKind,
  KIND,
  CreateConnectionProfileSchema,
  FileDatabaseBackupRequestSchema,
  FileDatabaseRestoreRequestSchema,
  UpdateConnectionProfileSchema,
  isSqlKind,
  isPasswordRequired,
  isUsernameRequired,
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
import { CONNECTION_HEALTH_INTERVAL_MS, CONNECTION_TEST_TIMEOUT_MS } from '../lib/constants.js';
import {
  backupFileDatabase,
  FileDatabaseMaintenanceError,
  restoreFileDatabase,
} from '../lib/file-database-maintenance.js';
import { getSqlAdapter, invalidateAdapterCache } from './sql.js';
import { log } from '../lib/logger.js';
import { safeErrorMessage } from '../lib/route-utils.js';

// Schema for testing connection without requiring a name (use base schema without refinement)
const TestConnectionSchema = z.object({
  kind: z.enum(ALL_KINDS as [string, ...string[]]),
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

type TestConnectionParams = {
  connectionId?: string;
  kind: DbKind;
  host?: string | null;
  port?: number | null;
  database?: string | null;
  username?: string | null;
  password?: string;
  ssl?: boolean | null;
  connectionString?: string | null;
  filePath?: string | null;
};

// Centralized switch for testing a connection by kind, called by all 3
// endpoints (SSE health, single health, /test) so per-kind params are
// defined in one place only.
async function testConnectionByKind(
  params: TestConnectionParams,
): Promise<{ success: boolean; message?: string; latencyMs?: number }> {
  const { kind, host, port, database, username, password, ssl, connectionString, filePath } = params;

  // Stored SQL profiles reuse their cached adapter so pooled engines validate
  // a live session without repeating authentication handshakes.
  if (params.connectionId && isSqlKind(kind)) {
    return (await getSqlAdapter(params.connectionId)).testConnection();
  }

  switch (kind) {
    case KIND.POSTGRES:
      return testPostgresConnection({
        host: host!,
        port: port!,
        database: database!,
        username: username!,
        password: password ?? '',
        ssl: ssl ?? false,
      });
    case KIND.MONGODB:
      return createMongoAdapter({
        connectionString: connectionString!,
        database: database ?? undefined,
      }).testConnection();
    case KIND.REDIS: {
      const redisDatabaseParsed = database ? parseInt(database, 10) : NaN;
      return testRedisConnection({
        host: host ?? undefined,
        port: port ?? undefined,
        password: password ?? undefined,
        database: Number.isNaN(redisDatabaseParsed) ? undefined : redisDatabaseParsed,
      });
    }
    case KIND.QDRANT:
      return createQdrantDbAdapter({ kind, host: host ?? undefined, port: port ?? undefined }).testConnection();
    case KIND.SQLITE:
      return testSqliteConnection(filePath ?? undefined);
    case KIND.MYSQL:
    case KIND.MARIADB:
      return testMysqlConnection({
        host: host ?? undefined,
        port: port ?? undefined,
        database: database ?? undefined,
        username: username ?? undefined,
        password: password ?? '',
      });
    case KIND.SQLSERVER:
      return testSqlServerConnection({
        host: host ?? undefined,
        port: port ?? undefined,
        database: database ?? undefined,
        username: username ?? undefined,
        password: password ?? '',
      });
    case KIND.ORACLE:
      return testOracleConnection({
        host: host ?? undefined,
        port: port ?? undefined,
        database: database ?? undefined,
        username: username ?? undefined,
        password: password ?? '',
      });
    case KIND.CLICKHOUSE:
      return testClickHouseConnection({
        host: host ?? undefined,
        port: port ?? undefined,
        database: database ?? undefined,
        username: username ?? undefined,
        password: password ?? '',
      });
    case KIND.DUCKDB:
      return testDuckDBConnection(filePath!);
    case KIND.TIGERBEETLE:
      return createTigerBeetleDbAdapter(
        { kind, host: host ?? undefined, port: port ?? undefined },
        password,
      ).testConnection();
    default:
      return { success: false, message: `Unsupported database kind: ${kind}` };
  }
}

type ConnectionTestResult = Awaited<ReturnType<typeof testConnectionByKind>>;
const activeHealthChecks = new Map<string, Promise<ConnectionTestResult>>();

// DB drivers lack shared cancellation, so cap each connection at one probe.
// A timed-out probe stays in the map until it settles — this prevents
// unbounded concurrent probes for hung drivers. withTimeout still returns a
// timeout result to the caller, but the underlying operation is reused on the
// next round. Add per-driver abort only when its client exposes a reliable signal.
function getActiveHealthCheck(connectionId: string, params: TestConnectionParams): Promise<ConnectionTestResult> {
  const active = activeHealthChecks.get(connectionId);
  if (active) return active;

  const check = testConnectionByKind(params);
  activeHealthChecks.set(connectionId, check);
  void check.then(
    () => {
      if (activeHealthChecks.get(connectionId) === check) activeHealthChecks.delete(connectionId);
    },
    () => {
      if (activeHealthChecks.get(connectionId) === check) activeHealthChecks.delete(connectionId);
    },
  );
  return check;
}

connectionsRouter.get('/', (c) => {
  const profiles = metadataStore.listProfiles();
  return c.json(profiles);
});

// SSE stream: pushes health status for all connections every 60 seconds using
// an async generator. Each event carries a map of connection-id → result.
// The client opens one EventSource instead of polling N individual endpoints.
// NOTE: literal routes must be registered BEFORE /:id to avoid Hono trie conflicts.
connectionsRouter.get('/health', async (c) => {
  const abortController = new AbortController();
  const PER_CHECK_TIMEOUT = CONNECTION_TEST_TIMEOUT_MS;

  // Clear the losing timer after every race; the shared in-flight map above
  // bounds adapters without native cancellation to one probe per connection.
  const withTimeout = async (promise: Promise<ConnectionTestResult>, ms: number): Promise<ConnectionTestResult> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<ConnectionTestResult>((resolve) => {
          timer = setTimeout(() => resolve({ success: false, message: `Timeout after ${ms}ms` }), ms);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

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
            const start = performance.now();
            const result = await withTimeout(
              getActiveHealthCheck(profile.id, {
                connectionId: profile.id,
                kind: profile.kind,
                host: profile.host,
                port: profile.port,
                database: profile.database,
                username: profile.username,
                password: password ?? undefined,
                ssl: profile.ssl,
                connectionString: profile.connectionString,
                filePath: profile.filePath,
              }),
              PER_CHECK_TIMEOUT,
            );
            result.latencyMs = Math.round(performance.now() - start);
            results[profile.id] = result;
          } catch (err) {
            log.error({ connectionId: profile.id, err }, 'Connection health check failed');
            results[profile.id] = {
              success: false,
              latencyMs: 0,
              message: safeErrorMessage(err),
            };
          }
        }),
      );

      yield `data: ${JSON.stringify(results)}\n\n`;

      // Wait before the next round so saved connections do not get hammered.
      // Race the delay against the abort signal so cancel() interrupts
      // the wait immediately instead of blocking for the full interval.
      await new Promise<void>((resolve) => {
        if (abortController.signal.aborted) return resolve();
        let timer: ReturnType<typeof setTimeout>;
        const onAbort = () => {
          clearTimeout(timer);
          resolve();
        };
        timer = setTimeout(() => {
          abortController.signal.removeEventListener('abort', onAbort);
          resolve();
        }, CONNECTION_HEALTH_INTERVAL_MS);
        abortController.signal.addEventListener('abort', onAbort, { once: true });
      });
      // Re-check after the delay — if cancelled during the wait, skip
      // the next health-check round and proceed to cleanup.
      if (abortController.signal.aborted) break;
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
// The SSE /health stream handles automatic updates, but the refresh
// button needs an immediate result.
connectionsRouter.get('/:id/health', async (c) => {
  const connectionId = c.req.param('id');
  const profile = metadataStore.getProfile(connectionId);
  if (!profile) return c.json({ error: 'NOT_FOUND', message: 'Connection not found', statusCode: 404 }, 404);
  const password = metadataStore.getProfilePassword(connectionId);
  try {
    const result = await testConnectionByKind({
      connectionId,
      kind: profile.kind,
      host: profile.host,
      port: profile.port,
      database: profile.database,
      username: profile.username,
      password: password ?? undefined,
      ssl: profile.ssl,
      connectionString: profile.connectionString,
      filePath: profile.filePath,
    });
    return c.json(result);
  } catch (err) {
    log.error({ connectionId: c.req.param('id'), err }, 'Test connection failed');
    return c.json({ success: false, message: safeErrorMessage(err) });
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
  activeHealthChecks.delete(id);
  return c.json(profile);
});

connectionsRouter.delete('/:id', (c) => {
  const id = c.req.param('id');
  const deleted = metadataStore.deleteProfile(id);
  if (!deleted) return c.json({ error: 'NOT_FOUND', message: 'Connection not found', statusCode: 404 }, 404);
  clearConnectionCache(id);
  invalidateAdapterCache(id);
  activeHealthChecks.delete(id);
  return c.body(null, 204);
});

connectionsRouter.post('/test', zValidator('json', TestConnectionSchema), async (c) => {
  const input = c.req.valid('json');

  // Validate password is provided for kinds that require it
  if (isPasswordRequired(input.kind) && !input.password) {
    return c.json({
      success: false,
      message: `Password is required for ${input.kind} connections`,
    });
  }

  // Validate username for kinds that require it (MySQL/MariaDB have no default user)
  if (isUsernameRequired(input.kind) && !input.username) {
    return c.json({
      success: false,
      message: `Username is required for ${input.kind} connections`,
    });
  }

  try {
    const result = await testConnectionByKind({
      kind: input.kind as DbKind,
      host: input.host,
      port: input.port,
      database: input.database,
      username: input.username,
      password: input.password,
      ssl: input.ssl,
      connectionString: input.connectionString,
      filePath: input.filePath,
    });
    return c.json(result);
  } catch (err) {
    log.error({ err }, 'Test connection (create) failed');
    return c.json({ success: false, message: safeErrorMessage(err) });
  }
});
