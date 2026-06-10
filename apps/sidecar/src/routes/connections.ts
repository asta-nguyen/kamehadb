import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { CreateConnectionProfileSchema, UpdateConnectionProfileSchema } from '@kamehadb/shared';
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

  const streamHealth = async function* () {
    while (!abortController.signal.aborted) {
      const profiles = metadataStore.listProfiles();
      const results: Record<string, { success: boolean; message?: string }> = {};

      for (const profile of profiles) {
        const password = metadataStore.getProfilePassword(profile.id);
        try {
          let result: { success: boolean; message?: string };
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
              result = await testRedisConnection({
                host: profile.host!,
                port: profile.port!,
                password: password ?? undefined,
                database: profile.database ? parseInt(profile.database, 10) || undefined : undefined,
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
                host: profile.host!,
                port: profile.port!,
                database: profile.database,
                username: profile.username!,
                password: password ?? '',
              });
              break;
            case 'sqlserver':
              result = await testSqlServerConnection({
                host: profile.host!,
                port: profile.port!,
                database: profile.database,
                username: profile.username!,
                password: password ?? '',
              });
              break;
            case 'oracle':
              result = await testOracleConnection({
                host: profile.host!,
                port: profile.port!,
                database: profile.database,
                username: profile.username!,
                password: password ?? '',
              });
              break;
            case 'clickhouse':
              result = await testClickHouseConnection({
                host: profile.host!,
                port: profile.port!,
                database: profile.database,
                username: profile.username!,
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
              result = { success: false, message: `Unsupported: ${profile.kind}` };
          }
          results[profile.id] = result;
        } catch (err) {
          results[profile.id] = {
            success: false,
            message: err instanceof Error ? err.message : 'Unknown error',
          };
        }
      }

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
        result = await testRedisConnection({
          host: profile.host,
          port: profile.port,
          password: password ?? undefined,
          database: profile.database ? parseInt(profile.database, 10) || undefined : undefined,
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
    return c.json({ success: false, message: err instanceof Error ? err.message : 'Unknown error' });
  }
});

connectionsRouter.get('/:id', (c) => {
  const profile = metadataStore.getProfile(c.req.param('id'));
  if (!profile) return c.json({ error: 'NOT_FOUND', message: 'Connection not found', statusCode: 404 }, 404);
  return c.json(profile);
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
  return c.json(profile);
});

connectionsRouter.delete('/:id', (c) => {
  const id = c.req.param('id');
  const deleted = metadataStore.deleteProfile(id);
  if (!deleted) return c.json({ error: 'NOT_FOUND', message: 'Connection not found', statusCode: 404 }, 404);
  clearConnectionCache(id);
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
    return c.json({
      success: false,
      message: err instanceof Error ? err.message : 'Unknown error',
    });
  }
});
