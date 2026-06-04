import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { chat, toServerSentEventsResponse } from '@tanstack/ai';
import { openaiCompatibleText } from '@tanstack/ai-openai/compatible';
import * as metadataStore from '../db/metadata-store.js';
import { resolveProviderConfig, validateProviderConfig, createEmbedding } from '../ai/provider.js';
import { buildSchemaContext } from '../ai/schema-context.js';
import { searchRelevantSchema } from '../ai/qdrant-store.js';
import { createSqlAdapter, createMongoDbAdapter } from '../adapters/factory.js';
import { getCached, setCache, CACHE_TTL, clearSchemaCache } from '../lib/cache.js';
import type { AIProvider, DbKind } from '@kamehadb/shared';

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
      forwardedProps: z
        .object({
          connectionId: z.string().optional(),
          mongoDatabase: z.string().optional(),
          provider: z.string().optional(),
          model: z.string().optional(),
        })
        .optional(),
      connectionId: z.string().optional(),
      mongoDatabase: z.string().optional(),
      messages: z.array(z.object({ role: z.string(), content: z.string() }).passthrough()),
      latestMessage: z.object({ role: z.string(), content: z.string() }).optional(),
      provider: z.string().optional(),
      model: z.string().optional(),
    }),
  ),
  async (c) => {
    try {
      const body = c.req.valid('json');

      const connectionId = body.forwardedProps?.connectionId ?? body.connectionId;
      const mongoDatabase = body.forwardedProps?.mongoDatabase ?? body.mongoDatabase;
      const providerOverride = body.forwardedProps?.provider ?? body.provider;
      const modelOverride = body.forwardedProps?.model ?? body.model;

      // Find last user message for persistence (forwardedProps format or legacy)
      const latestUserMsg =
        body.messages.filter((m) => m.role === 'user').at(-1)?.content ?? body.latestMessage?.content;

      if (connectionId && latestUserMsg) {
        metadataStore.saveChatMessage(connectionId, 'user', latestUserMsg, mongoDatabase);
      }

      const settings = metadataStore.getAISettings();
      // Resolve which provider config to use
      const providerName: AIProvider = (providerOverride as AIProvider) ?? settings.activeProvider;
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
      const config = { ...providerConfig, model: modelOverride ?? providerConfig.model };

      // Build schema context if connectionId provided
      let ddl: string | null = null;
      let mongoSchema: string | null = null;
      let connectionKind: DbKind | undefined;
      if (connectionId) {
        const profile = metadataStore.getProfile(connectionId);
        connectionKind = profile?.kind;

        const cacheKey = mongoDatabase
          ? `ai-schema:${connectionId}:mongo:${mongoDatabase}`
          : `ai-schema:${connectionId}:sql`;

        if (mongoDatabase) {
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
                  mongoSchema = await buildMongoSchemaContext(adapter, mongoDatabase);
                  setCache(cacheKey, mongoSchema);
                } finally {
                  await adapter.close();
                }
              } else if (profile.kind !== 'redis') {
                const password = metadataStore.getProfilePassword(connectionId);
                const adapter = createSqlAdapter(profile, password);
                if (adapter) {
                  try {
                    const userQuery = latestUserMsg;
                    if (userQuery) {
                      const relevant = await searchRelevantSchema(
                        connectionId,
                        userQuery,
                        providerName,
                        config,
                        5,
                      ).catch(() => []);
                      if (relevant.length > 0) {
                        ddl = relevant.map((r) => r.ddl).join('\n\n');
                      }
                    }
                    if (!ddl) {
                      ddl = await buildSchemaContext(adapter);
                    }
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
      const llmMessages = [{ role: 'system', content: systemPrompt }, ...body.messages] as any;

      const resolved = resolveProviderConfig(providerName, config);
      const abortController = new AbortController();

      const stream = chat({
        adapter: openaiCompatibleText(config.model, {
          baseURL: resolved.baseUrl,
          apiKey: resolved.apiKey,
        }),
        messages: llmMessages,
        abortController,
      });

      let assistantContent = '';
      const wrappedStream = (async function* () {
        try {
          for await (const chunk of stream) {
            if (chunk.type === 'TEXT_MESSAGE_CONTENT') {
              assistantContent += (chunk as { delta: string }).delta;
            }
            yield chunk;
          }
        } finally {
          if (connectionId && assistantContent) {
            try {
              metadataStore.saveChatMessage(connectionId, 'assistant', assistantContent, mongoDatabase);
            } catch (e) {
              console.error('[AI] Failed to save assistant message:', e);
            }
          }
        }
      })();

      return toServerSentEventsResponse(wrappedStream, { abortController });
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
      const vector = await createEmbedding(body.text, providerName, providerConfig, body.model);
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
