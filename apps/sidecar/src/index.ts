import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { initMetadataStore, closeMetadataStore } from './db/metadata-store.js';
import { connectionsRouter } from './routes/connections.js';
import { sqlRouter } from './routes/sql.js';
import { mongoRouter, killAllMongoShells } from './routes/mongo.js';
import { redisRouter } from './routes/redis.js';
import { qdrantRouter } from './routes/qdrant.js';
import { tigerbeetleRouter } from './routes/tigerbeetle.js';
import { aiRouter } from './routes/ai.js';
import { queryHistoryRouter } from './routes/query-history.js';
import { indexAllConnections } from './ai/indexer.js';
import { log } from './lib/logger.js';
import { schemaWatcher } from './lib/schema-watcher.js';

const allowedOrigins = ['http://localhost:3000', 'http://localhost:5173', 'file://'];
const sidecarDir = dirname(fileURLToPath(import.meta.url));

const app = new Hono();

function sanitizeLogPath(path: string): string {
  const redactedSegment = ':redacted';
  return path
    .split('/')
    .map((segment) => {
      if (segment.length > 24 || /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(segment) || /^[A-Za-z0-9_-]{24,}$/.test(segment)) {
        return redactedSegment;
      }
      return segment;
    })
    .join('/');
}

// Send access logs through pino so the in-app Logs page sees the same request
// events that operators see on stdout and in sidecar.log.
app.use('*', async (c, next) => {
  const startedAt = performance.now();
  let threw = false;
  try {
    await next();
  } catch (err) {
    threw = true;
    throw err;
  } finally {
    const durationMs = Math.round((performance.now() - startedAt) * 10) / 10;
    const requestLog = {
      scope: 'http',
      method: c.req.method,
      path: sanitizeLogPath(c.req.path),
      status: c.res.status,
      durationMs,
    };

    if (threw || c.res.status >= 500) {
      log.error(requestLog, 'HTTP request');
    } else if (c.res.status >= 400) {
      log.warn(requestLog, 'HTTP request');
    } else {
      log.info(requestLog, 'HTTP request');
    }
  }
});
app.use('*', cors({ origin: '*' }));

// Ensure all errors return JSON so the frontend never gets unparseable HTML/text
app.onError((err, c) => {
  log.error({ err }, 'Unhandled error');
  return c.json({ message: err.message || 'Internal Server Error' }, 500);
});

// Health
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    uptime: process.uptime(),
    version: '0.1.0',
  });
});

// Routes
app.route('/connections', connectionsRouter);
app.route('/sql', sqlRouter);
app.route('/mongo', mongoRouter);
app.route('/redis', redisRouter);
app.route('/qdrant', qdrantRouter);
app.route('/tigerbeetle', tigerbeetleRouter);
app.route('/ai', aiRouter);
app.route('/query-history', queryHistoryRouter);

// Start server
async function start() {
  const defaultDbPath = resolve(sidecarDir, '../kamehadb.db');
  const dbPath = process.env.KAMEHADB_DATA_DIR ? `${process.env.KAMEHADB_DATA_DIR}/kamehadb.db` : defaultDbPath;

  initMetadataStore(dbPath);
  log.info({ dbPath }, 'Metadata store initialized');

  const port = process.env.PORT ? parseInt(process.env.PORT) : 3170;
  const server = serve({
    fetch: app.fetch,
    port,
    hostname: '127.0.0.1',
  });

  const addr = server.address();
  const listeningPort = typeof addr === 'object' && addr ? addr.port : port;
  log.info({ port: listeningPort }, 'Sidecar listening on 127.0.0.1');

  // eslint-disable-next-line local/no-restricted-syntax -- intentional stdout for Tauri to parse the port
  console.log(`KAMEHADB_SIDECAR_PORT=${listeningPort}`);

  // Proactively index schemas for all SQL connections in the background
  indexAllConnections().catch((err) => log.error(err, 'Schema indexing failed'));

  // Resume any enabled schema watchers from persisted config
  schemaWatcher.resumeAll();
}

// Graceful shutdown
process.on('SIGINT', () => {
  log.info('Shutting down...');
  schemaWatcher.stopAll();
  killAllMongoShells();
  closeMetadataStore();
  process.exit(0);
});

process.on('SIGTERM', () => {
  schemaWatcher.stopAll();
  killAllMongoShells();
  closeMetadataStore();
  process.exit(0);
});

start().catch((err) => {
  log.error(err, 'Failed to start sidecar');
  process.exit(1);
});
