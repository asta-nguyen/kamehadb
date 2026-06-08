import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import pino from 'pino';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { initMetadataStore, closeMetadataStore } from './db/metadata-store.js';
import { connectionsRouter } from './routes/connections.js';
import { sqlRouter } from './routes/sql.js';
import { mongoRouter } from './routes/mongo.js';
import { redisRouter } from './routes/redis.js';
import { qdrantRouter } from './routes/qdrant.js';
import { tigerbeetleRouter } from './routes/tigerbeetle.js';
import { aiRouter } from './routes/ai.js';
import { queryHistoryRouter } from './routes/query-history.js';
import { indexAllConnections } from './ai/indexer.js';

const allowedOrigins = ['http://localhost:3000', 'http://localhost:5173', 'file://'];

const log = pino({
  transport: {
    target: 'pino-pretty',
    options: { colorize: true },
  },
  level: process.env.LOG_LEVEL || 'info',
  redact: ['password', 'secret', 'token'],
});

const app = new Hono();

app.use('*', logger());
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
  const sidecarDir = dirname(fileURLToPath(import.meta.url));
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

  console.log(`KAMEHADB_SIDECAR_PORT=${listeningPort}`);

  // Proactively index schemas for all SQL connections in the background
  indexAllConnections().catch((err) => log.error(err, 'Schema indexing failed'));
}

// Graceful shutdown
process.on('SIGINT', () => {
  log.info('Shutting down...');
  closeMetadataStore();
  process.exit(0);
});

process.on('SIGTERM', () => {
  closeMetadataStore();
  process.exit(0);
});

start().catch((err) => {
  log.error(err, 'Failed to start sidecar');
  process.exit(1);
});
