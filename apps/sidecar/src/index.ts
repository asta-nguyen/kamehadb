import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import pino from 'pino';
import { initMetadataStore, closeMetadataStore } from './db/metadata-store.js';
import { connectionsRouter } from './routes/connections.js';
import { sqlRouter } from './routes/sql.js';
import { mongoRouter } from './routes/mongo.js';
import { aiRouter } from './routes/ai.js';

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
app.route('/ai', aiRouter);

// Start server
async function start() {
  const dbPath = process.env.KAMEHADB_DATA_DIR ? `${process.env.KAMEHADB_DATA_DIR}/kamehadb.db` : './kamehadb.db';

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
