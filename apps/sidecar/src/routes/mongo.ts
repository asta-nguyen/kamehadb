import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { getCached, setCache } from '../lib/cache.js';
import * as metadataStore from '../db/metadata-store.js';
import { createMongoDbAdapter } from '../adapters/factory.js';
import * as pty from 'node-pty';
import { nanoid } from 'nanoid';
import { streamSSE } from 'hono/streaming';
import { resolveMongoshCommand } from '../lib/mongosh.js';
import { SHELL_TIMEOUT_MS } from '../lib/constants.js';
import { log } from '../lib/logger.js';

export const mongoRouter = new Hono();

function handleError(c: any, err: unknown, context: string) {
  console.error(`[Mongo] ${context}:`, err instanceof Error ? err.stack || err.message : err);
  return c.json({ error: 'INTERNAL_ERROR', message: 'An internal error occurred' }, 500);
}

async function getAdapter(connectionId: string) {
  const profile = metadataStore.getProfile(connectionId);
  if (!profile) throw new Error('Connection not found');

  if (profile.kind !== 'mongodb') {
    throw new Error('This endpoint is for MongoDB connections only');
  }

  return createMongoDbAdapter(profile);
}

// GET /mongo/:connectionId/collections
mongoRouter.get('/:connectionId/collections', async (c) => {
  const connectionId = c.req.param('connectionId');
  const database = c.req.query('database') || '';
  const cacheKey = `mongo:${connectionId}:collections:${database}`;
  const cached = getCached<unknown[]>(cacheKey);
  if (cached) return c.json(cached);

  try {
    const adapter = await getAdapter(connectionId);
    try {
      const collections = await adapter.listCollections(database || undefined);
      setCache(cacheKey, collections);
      return c.json(collections);
    } finally {
      await adapter.close();
    }
  } catch (err) {
    return handleError(c, err, 'listCollections');
  }
});

// GET /mongo/:connectionId/databases
mongoRouter.get('/:connectionId/databases', async (c) => {
  const connectionId = c.req.param('connectionId');
  const cacheKey = `mongo:${connectionId}:databases`;
  const cached = getCached<unknown[]>(cacheKey);
  if (cached) return c.json(cached);

  try {
    const adapter = await getAdapter(connectionId);
    try {
      const databases = await adapter.listDatabases();
      setCache(cacheKey, databases);
      return c.json(databases);
    } finally {
      await adapter.close();
    }
  } catch (err) {
    return handleError(c, err, 'listDatabases');
  }
});

// POST /mongo/:connectionId/find
mongoRouter.post(
  '/:connectionId/find',
  zValidator(
    'json',
    z.object({
      collection: z.string(),
      database: z.string().optional(),
      filter: z.record(z.unknown()).optional(),
      projection: z.record(z.unknown()).optional(),
      sort: z.record(z.union([z.literal(1), z.literal(-1)])).optional(),
      skip: z.number().int().nonnegative().optional(),
      limit: z.number().int().min(1).max(1000).optional(),
      search: z.string().optional(),
    }),
  ),
  async (c) => {
    try {
      const adapter = await getAdapter(c.req.param('connectionId'));
      try {
        const result = await adapter.findDocuments(c.req.valid('json'));
        return c.json(result);
      } finally {
        await adapter.close();
      }
    } catch (err) {
      return handleError(c, err, 'findDocuments');
    }
  },
);

// POST /mongo/:connectionId/aggregate
mongoRouter.post(
  '/:connectionId/aggregate',
  zValidator(
    'json',
    z.object({
      collection: z.string(),
      database: z.string().optional(),
      pipeline: z.array(z.record(z.unknown())),
      limit: z.number().int().min(1).max(1000).optional(),
    }),
  ),
  async (c) => {
    try {
      const adapter = await getAdapter(c.req.param('connectionId'));
      try {
        const result = await adapter.aggregate(c.req.valid('json'));
        return c.json(result);
      } finally {
        await adapter.close();
      }
    } catch (err) {
      return handleError(c, err, 'aggregate');
    }
  },
);

// POST /mongo/:connectionId/delete
mongoRouter.post(
  '/:connectionId/delete',
  zValidator(
    'json',
    z.object({
      collection: z.string(),
      database: z.string().optional(),
      filter: z.record(z.unknown()).refine((obj) => Object.keys(obj).length > 0, {
        message: 'filter must not be empty',
      }),
    }),
  ),
  async (c) => {
    try {
      const connectionId = c.req.param('connectionId');
      const profile = metadataStore.getProfile(connectionId);
      if (!profile) return c.json({ error: 'NOT_FOUND', message: 'Connection not found' }, 404);
      const adapter = await getAdapter(connectionId);
      try {
        const { collection, database, filter } = c.req.valid('json');
        const result = await adapter.deleteDocument(database || '', collection, filter);
        return c.json(result);
      } finally {
        await adapter.close();
      }
    } catch (err) {
      return handleError(c, err, 'deleteDocument');
    }
  },
);

// POST /mongo/:connectionId/update
mongoRouter.post(
  '/:connectionId/update',
  zValidator(
    'json',
    z.object({
      collection: z.string(),
      database: z.string().optional(),
      filter: z.record(z.unknown()).refine((obj) => Object.keys(obj).length > 0, {
        message: 'filter must not be empty',
      }),
      update: z.record(z.unknown()),
    }),
  ),
  async (c) => {
    try {
      const connectionId = c.req.param('connectionId');
      const profile = metadataStore.getProfile(connectionId);
      if (!profile) return c.json({ error: 'NOT_FOUND', message: 'Connection not found' }, 404);
      const adapter = await getAdapter(connectionId);
      try {
        const { collection, database, filter, update } = c.req.valid('json');
        const result = await adapter.updateDocument(database || '', collection, filter, update);
        return c.json(result);
      } finally {
        await adapter.close();
      }
    } catch (err) {
      return handleError(c, err, 'updateDocument');
    }
  },
);

// GET /mongo/:connectionId/stats
mongoRouter.get('/:connectionId/stats', async (c) => {
  try {
    const adapter = await getAdapter(c.req.param('connectionId'));
    try {
      const database = c.req.query('database');
      const collection = c.req.query('collection');
      if (!database || !collection) {
        return c.json({ error: 'MISSING_PARAMS', message: 'database and collection are required' }, 400);
      }
      const result = await adapter.getCollectionStats(database, collection);
      return c.json(result);
    } finally {
      await adapter.close();
    }
  } catch (err) {
    return handleError(c, err, 'getCollectionStats');
  }
});

// POST /mongo/:connectionId/command
mongoRouter.post(
  '/:connectionId/command',
  zValidator(
    'json',
    z.object({
      database: z.string().optional(),
      command: z.record(z.unknown()),
    }),
  ),
  async (c) => {
    try {
      const adapter = await getAdapter(c.req.param('connectionId'));
      try {
        const { database, command } = c.req.valid('json');
        const result = await adapter.runCommand(database || '', command);
        return c.json(result);
      } finally {
        await adapter.close();
      }
    } catch (err) {
      return handleError(c, err, 'runCommand');
    }
  },
);

// GET /mongo/:connectionId/autocomplete
// Returns collection names + field names from sample documents for autocomplete.
mongoRouter.get('/:connectionId/autocomplete', async (c) => {
  const connectionId = c.req.param('connectionId');
  const database = c.req.query('database') || '';
  const cacheKey = `mongo:${connectionId}:completions:${database}`;
  const cached = getCached<{ collections: { name: string; fields: string[] }[] }>(cacheKey);
  if (cached) return c.json(cached);

  try {
    const adapter = await getAdapter(connectionId);
    try {
      const collections = await adapter.listCollections(database || undefined);
      // Sample one document from each collection to extract field names
      const result = [];
      for (const coll of collections) {
        let fields: string[] = [];
        try {
          const sample = await adapter.findDocuments({
            collection: coll.name,
            database: database || undefined,
            limit: 1,
          });
          if (sample.documents.length > 0) {
            fields = Object.keys(sample.documents[0]);
          }
        } catch {
          // skip collections we can't sample
        }
        result.push({ name: coll.name, fields });
      }
      const data = { collections: result };
      setCache(cacheKey, data);
      return c.json(data);
    } finally {
      await adapter.close();
    }
  } catch (err) {
    return handleError(c, err, 'completions');
  }
});

// GET /mongo/:connectionId/test
mongoRouter.get('/:connectionId/test', async (c) => {
  try {
    const adapter = await getAdapter(c.req.param('connectionId'));
    try {
      const result = await adapter.testConnection();
      return c.json(result);
    } finally {
      await adapter.close();
    }
  } catch (err) {
    return handleError(c, err, 'testConnection');
  }
});

// ---------------------------------------------------------------------------
// MongoDB Shell (mongosh) — in-browser terminal via HTTP + SSE
// ---------------------------------------------------------------------------
// Manages long-running mongosh child processes. The frontend uses an SSE
// stream for output and POST endpoints for input + lifecycle.
//
// These routes work in both Tauri desktop and plain browser dev mode since
// they communicate with the sidecar directly over HTTP.

interface MongoShellSession {
  pty: pty.IPty;
  createdAt: number;
  /** Output buffer — accumulates PTY data from spawn until SSE connects */
  buffer: string;
  disposable?: { dispose: () => void };
}

const shellSessions = new Map<string, MongoShellSession>();

// Prune expired sessions every 60 seconds
const SHELL_CLEANUP = setInterval(() => {
  const now = Date.now();
  for (const [id, session] of shellSessions) {
    if (now - session.createdAt > SHELL_TIMEOUT_MS) {
      session.pty.kill();
      shellSessions.delete(id);
    }
  }
}, 60_000);

// Allow the server shutdown handler to clean up all shells
export function killAllMongoShells(): void {
  for (const [, session] of shellSessions) {
    session.pty.kill();
  }
  shellSessions.clear();
  clearInterval(SHELL_CLEANUP);
}

// POST /mongo/:connectionId/shell — start a mongosh process with a real PTY
mongoRouter.post('/:connectionId/shell', async (c) => {
  const connectionId = c.req.param('connectionId');
  const profile = metadataStore.getProfile(connectionId);
  if (!profile) return c.json({ error: 'NOT_FOUND', message: 'Connection not found' }, 404);

  let cols = 80;
  let rows = 24;
  try {
    const body = await c.req.json<{ cols?: number; rows?: number }>();
    if (body.cols) cols = body.cols;
    if (body.rows) rows = body.rows;
  } catch {}
  const connStr = profile.connectionString || '';
  const sessionId = nanoid();
  const mongoshCommand = await resolveMongoshCommand();

  let ptyProcess: pty.IPty;
  try {
    // node-pty spawns a real pseudo-terminal so mongosh thinks it's
    // connected to an actual terminal — colors, box-drawing, and
    // interactive input all work out of the box.
    const args = [...mongoshCommand.argsPrefix, connStr];
    console.debug('[mongosh] spawning pty:', { program: mongoshCommand.program, cols, rows });
    ptyProcess = pty.spawn(mongoshCommand.program, args, {
      name: 'xterm-256color',
      cols,
      rows,
      env: { ...process.env } as Record<string, string | undefined>,
    });
  } catch (err) {
    console.error('[mongosh] pty.spawn failed:', { mongoshCommand, error: err });
    throw new Error(`mongosh failed to start: ${err instanceof Error ? err.message : String(err)}`);
  }

  shellSessions.set(sessionId, { pty: ptyProcess, createdAt: Date.now(), buffer: '' });

  // Capture PTY output from spawn time so it's available when SSE connects.
  const bufDisposable = ptyProcess.onData((data) => {
    const session = shellSessions.get(sessionId);
    if (session) session.buffer += data;
  });
  shellSessions.get(sessionId)!.disposable = bufDisposable;

  ptyProcess.onExit(({ exitCode }) => {
    log.info({ exitCode }, '[MongoShell] mongosh exited');
    shellSessions.delete(sessionId);
  });

  return c.json({ sessionId });
});

// GET /mongo/:connectionId/shell/:sessionId/stream — SSE event stream
mongoRouter.get('/:connectionId/shell/:sessionId/stream', async (c) => {
  const sessionId = c.req.param('sessionId');
  const session = shellSessions.get(sessionId);
  if (!session) return c.json({ error: 'NOT_FOUND', message: 'Shell session not found' }, 404);

  return streamSSE(c, async (stream) => {
    const term = session.pty;
    let running = true;

    // Flush any output that arrived before this SSE client connected.
    if (session.buffer) {
      await stream.writeSSE({ data: JSON.stringify({ type: 'output', data: session.buffer }) });
      session.buffer = '';
    }
    // Stop buffering — the SSE stream now owns live output.
    session.disposable?.dispose();
    session.disposable = undefined;

    const onDataDisposable = term.onData((data) => {
      if (!running) return;
      stream.writeSSE({ data: JSON.stringify({ type: 'output', data }) }).catch(() => {});
    });

    const onExitDisposable = term.onExit(({ exitCode }) => {
      if (!running) return;
      running = false;
      stream.writeSSE({ data: JSON.stringify({ type: 'exit', code: exitCode }) }).catch(() => {});
      stream.close();
    });

    stream.onAbort(() => {
      running = false;
      onDataDisposable.dispose();
      onExitDisposable.dispose();
      // Resume buffering so the next SSE reconnect picks up any output
      // produced while no client is connected.
      session.buffer = '';
      session.disposable = term.onData((data) => {
        const s = shellSessions.get(sessionId);
        if (s) s.buffer += data;
      });
    });

    while (running && !stream.closed) {
      await stream.sleep(5000);
    }
  });
});

// POST /mongo/shell/:sessionId/write — send keystrokes to stdin
mongoRouter.post('/shell/:sessionId/write', async (c) => {
  const sessionId = c.req.param('sessionId');
  const session = shellSessions.get(sessionId);
  if (!session) return c.json({ error: 'NOT_FOUND', message: 'Shell session not found' }, 404);

  const { data } = await c.req.json<{ data: string }>();
  session.pty.write(data);
  return c.body(null, 204);
});

// POST /mongo/shell/:sessionId/resize — resize the PTY
mongoRouter.post('/shell/:sessionId/resize', async (c) => {
  const sessionId = c.req.param('sessionId');
  const session = shellSessions.get(sessionId);
  if (!session) return c.json({ error: 'NOT_FOUND', message: 'Shell session not found' }, 404);

  const { cols, rows } = await c.req.json<{ cols: number; rows: number }>();
  session.pty.resize(cols, rows);
  return c.body(null, 204);
});

// DELETE /mongo/shell/:sessionId — kill the shell process
mongoRouter.delete('/shell/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId');
  const session = shellSessions.get(sessionId);
  if (!session) return c.json({ error: 'NOT_FOUND', message: 'Shell session not found' }, 404);

  session.pty.kill();
  shellSessions.delete(sessionId);
  return c.body(null, 204);
});
