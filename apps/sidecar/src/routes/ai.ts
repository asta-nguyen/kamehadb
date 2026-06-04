import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import * as metadataStore from '../db/metadata-store.js';
import { createProvider, validateProviderConfig, createEmbedding } from '../ai/provider.js';
import { buildSchemaContext } from '../ai/schema-context.js';
import { createSqlAdapter, createMongoDbAdapter } from '../adapters/factory.js';
import { getCached, setCache, CACHE_TTL, clearSchemaCache } from '../lib/cache.js';
import type { AIChatMessage, AIProvider, DbKind } from '@kamehadb/shared';

export const aiRouter = new Hono();
const providerConfigSchema = z.object({
  enabled: z.boolean(),
  model: z.string(),
  baseUrl: z.string().optional(),
  apiKey: z.string().optional(),
});

async function buildMongoSchemaContext(
  adapter: ReturnType<typeof createMongoDbAdapter>,
  database?: string,
): Promise<string | null> {
  try {
    const lines: string[] = [];

    if (database) {
      // Get schema for specific database
      lines.push(`## Database: ${database}`);
      const collections = await adapter.listCollections(database);

      for (const coll of collections.slice(0, 10)) {
        const stats = await adapter.getCollectionStats(database, coll.name);
        lines.push(`### ${coll.name} (${stats.documentCount.toLocaleString()} docs)`);

        if (stats.documentCount > 0) {
          const result = await adapter.findDocuments({
            collection: coll.name,
            database,
            limit: 1,
          });
          if (result.documents.length > 0) {
            const sample = result.documents[0];
            const fields = Object.keys(sample)
              .slice(0, 15)
              .map((k) => {
                const v = sample[k];
                const type = v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
                return `  ${k}: ${type}`;
              });
            lines.push('Fields:');
            lines.push(fields.join('\n'));
          }
        }
      }
    } else {
      // Get schema for all databases (fallback)
      const databases = await adapter.listDatabases();
      if (databases.length === 0) return null;

      lines.push('MongoDB Databases:');
      const userDatabases = databases.filter((db) => !['admin', 'local', 'config'].includes(db.name));

      for (const db of userDatabases.slice(0, 10)) {
        lines.push(`## ${db.name}`);
        const collections = await adapter.listCollections(db.name);

        for (const coll of collections.slice(0, 10)) {
          const stats = await adapter.getCollectionStats(db.name, coll.name);
          lines.push(`### ${coll.name} (${stats.documentCount.toLocaleString()} docs)`);

          if (stats.documentCount > 0) {
            const result = await adapter.findDocuments({
              collection: coll.name,
              database: db.name,
              limit: 1,
            });
            if (result.documents.length > 0) {
              const sample = result.documents[0];
              const fields = Object.keys(sample)
                .slice(0, 15)
                .map((k) => {
                  const v = sample[k];
                  const type = v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
                  return `  ${k}: ${type}`;
                });
              lines.push('Fields:');
              lines.push(fields.join('\n'));
            }
          }
        }
        lines.push('');
      }
    }

    return lines.join('\n');
  } catch {
    return null;
  }
}

function buildSystemPrompt(ddl: string | null, mongoSchema: string | null, connectionKind?: DbKind): string {
  let prompt = `You are a database assistant embedded in a database admin tool called kamehadb. Your job is to help users write queries and understand their data.

Rules:
- Generate ONLY valid queries — no commentary outside code blocks unless the user asks.
- Use \`\`\`sql ... \`\`\` for SQL queries.
- Use MongoDB aggregation pipeline syntax in \`\`\`javascript ... \`\`\` for MongoDB queries.
- Use Redis CLI command syntax in \`\`\`redis ... \`\`\` for Redis commands.
- Default to read-only queries. If the user asks for writes, note the risk.
- Be concise.`;

  if (connectionKind === 'redis') {
    prompt += `\n\nCurrent connection type: Redis.
For Redis requests, answer with Redis CLI commands, not SQL. Prefer read-only commands such as SCAN, TYPE, TTL, MEMORY USAGE, INFO, DBSIZE, HGETALL, LRANGE, SMEMBERS, and ZRANGE.`;
  } else if (connectionKind === 'mongodb') {
    prompt += `\n\nCurrent connection type: MongoDB.
For MongoDB requests, answer with MongoDB filter, find, or aggregation syntax, not SQL.`;
  } else if (connectionKind) {
    prompt += `\n\nCurrent connection type: ${connectionKind}.`;
  }

  if (ddl) {
    prompt += `\n\nThe current database schema is:\n\n${ddl}`;
  }

  if (mongoSchema) {
    prompt += `\n\n${mongoSchema}`;
  }

  return prompt;
}

// POST /ai/chat
aiRouter.post(
  '/chat',
  zValidator(
    'json',
    z.object({
      connectionId: z.string().optional(),
      mongoDatabase: z.string().optional(),
      messages: z.array(
        z.object({
          role: z.enum(['user', 'assistant', 'system']),
          content: z.string(),
        }),
      ),
      latestMessage: z
        .object({
          role: z.enum(['user', 'assistant', 'system']),
          content: z.string(),
        })
        .optional(),
      provider: z.enum(['ollama-local', 'ollama-cloud', 'openai', '9router']).optional(),
      model: z.string().optional(),
    }),
  ),
  async (c) => {
    try {
      const body = c.req.valid('json');

      // Persist only the newest user message; full history is still passed for model context.
      if (body.connectionId && body.latestMessage?.role === 'user') {
        metadataStore.saveChatMessage(body.connectionId, 'user', body.latestMessage.content, body.mongoDatabase);
      }

      const settings = metadataStore.getAISettings();
      // Resolve which provider config to use
      const providerName: AIProvider = body.provider ?? settings.activeProvider;
      const providerConfig = settings.providers[providerName];
      if (!providerConfig) {
        return c.json({ error: 'AI_CONFIG_ERROR', message: `Provider "${providerName}" has no configuration.` }, 400);
      }
      if (!providerConfig.enabled) {
        return c.json({ error: 'AI_CONFIG_ERROR', message: `Provider "${providerName}" is not enabled.` }, 400);
      }

      const validationError = validateProviderConfig(providerName, providerConfig);
      if (validationError) {
        return c.json({ error: 'AI_CONFIG_ERROR', message: validationError }, 400);
      }

      // Allow per-request model override
      const config = { ...providerConfig, model: body.model ?? providerConfig.model };

      // Build schema context if connectionId provided
      let ddl: string | null = null;
      let mongoSchema: string | null = null;
      let connectionKind: DbKind | undefined;
      if (body.connectionId) {
        const profile = metadataStore.getProfile(body.connectionId);
        connectionKind = profile?.kind;

        // Try to get from cache first
        const cacheKey = body.mongoDatabase
          ? `ai-schema:${body.connectionId}:mongo:${body.mongoDatabase}`
          : `ai-schema:${body.connectionId}:sql`;

        if (body.mongoDatabase) {
          mongoSchema = getCached<string>(cacheKey, CACHE_TTL.AI_SCHEMA);
        } else {
          ddl = getCached<string>(cacheKey, CACHE_TTL.AI_SCHEMA);
        }

        if (!ddl && !mongoSchema) {
          try {
            if (profile) {
              if (profile.kind === 'mongodb') {
                const adapter = createMongoDbAdapter(profile);
                try {
                  mongoSchema = await buildMongoSchemaContext(adapter, body.mongoDatabase);
                  setCache(cacheKey, mongoSchema);
                } finally {
                  await adapter.close();
                }
              } else if (profile.kind !== 'redis') {
                const password = metadataStore.getProfilePassword(body.connectionId);
                const adapter = createSqlAdapter(profile, password);
                if (adapter) {
                  try {
                    ddl = await buildSchemaContext(adapter);
                    setCache(cacheKey, ddl);
                  } finally {
                    await adapter.close();
                  }
                }
              }
            }
          } catch {
            // Silently fail, LLM can work without schema
          }
        }
      }

      const systemPrompt = buildSystemPrompt(ddl, mongoSchema, connectionKind);
      console.log('System prompt:', systemPrompt);
      const messages: AIChatMessage[] = [{ role: 'system', content: systemPrompt }, ...body.messages];

      const llmProvider = createProvider(providerName, config);
      const result = await llmProvider.chat(messages);

      // Save assistant response to history
      if (body.connectionId) {
        metadataStore.saveChatMessage(body.connectionId, 'assistant', result.content, body.mongoDatabase);
      }

      return c.json({
        message: {
          role: 'assistant' as const,
          content: result.content,
        },
        usage: {
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI chat failed';
      console.error('[AI] chat error:', message);
      return c.json({ error: 'AI_ERROR', message }, 500);
    }
  },
);

// POST /ai/embed — turn text into an embedding vector via the active (or named) provider
aiRouter.post(
  '/embed',
  zValidator(
    'json',
    z.object({
      text: z.string().min(1),
      model: z.string().optional(),
      provider: z.enum(['ollama-local', 'ollama-cloud', 'openai', '9router']).optional(),
    }),
  ),
  async (c) => {
    const body = c.req.valid('json');
    try {
      const settings = metadataStore.getAISettings();
      const providerName: AIProvider = body.provider ?? settings.activeProvider;
      const providerConfig = settings.providers[providerName];
      const vector = await createEmbedding(providerName, providerConfig, body.text, body.model);
      return c.json({ vector, dimensions: vector.length });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create embedding';
      return c.json({ error: 'EMBED_ERROR', message }, 500);
    }
  },
);

// GET /ai/settings
aiRouter.get('/settings', async (c) => {
  return c.json(metadataStore.getAISettings());
});

// POST /ai/settings
aiRouter.post(
  '/settings',
  zValidator(
    'json',
    z.object({
      activeProvider: z.enum(['ollama-local', 'ollama-cloud', 'openai', '9router']),
      providers: z.object({
        'ollama-local': providerConfigSchema,
        'ollama-cloud': providerConfigSchema,
        openai: providerConfigSchema,
        '9router': providerConfigSchema,
      }),
    }),
  ),
  async (c) => {
    try {
      const body = c.req.valid('json');
      if (!body.providers[body.activeProvider].enabled) {
        return c.json({ error: 'CONFIG_ERROR', message: 'Active provider must be enabled.' }, 400);
      }
      const activeValidationError = validateProviderConfig(body.activeProvider, body.providers[body.activeProvider]);
      if (activeValidationError) {
        return c.json({ error: 'CONFIG_ERROR', message: activeValidationError }, 400);
      }
      metadataStore.saveAISettings(body);
      return c.json({ success: true });
    } catch (err) {
      console.error('[AI] save settings error:', err);
      const message = err instanceof Error ? err.message : 'Failed to save AI settings';
      return c.json({ error: 'CONFIG_ERROR', message }, 500);
    }
  },
);

// GET /ai/chat-history/:connectionId
aiRouter.get('/chat-history/:connectionId', async (c) => {
  const connectionId = c.req.param('connectionId');
  const parsed = parseInt(c.req.query('limit') ?? '50', 10);
  const limit = Number.isNaN(parsed) ? 50 : Math.min(Math.max(parsed, 1), 200);
  const mongoDatabase = c.req.query('database') || undefined;
  const messages = metadataStore.getChatMessages(connectionId, limit, mongoDatabase);
  return c.json({ messages });
});

// DELETE /ai/chat-history/:connectionId
aiRouter.delete('/chat-history/:connectionId', async (c) => {
  const connectionId = c.req.param('connectionId');
  const mongoDatabase = c.req.query('database') || undefined;
  metadataStore.clearChatMessages(connectionId, mongoDatabase);
  return c.json({ success: true });
});

// POST /ai/clear-schema-cache/:connectionId
aiRouter.post('/clear-schema-cache/:connectionId', async (c) => {
  const connectionId = c.req.param('connectionId');
  const mongoDatabase = c.req.query('database') || undefined;
  clearSchemaCache(connectionId, mongoDatabase);
  return c.json({ success: true });
});
