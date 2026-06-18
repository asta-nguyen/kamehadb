import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import * as metadataStore from '../db/metadata-store.js';
import { validateProviderConfig, createProvider, createEmbedding } from '../ai/provider.js';
import { buildSchemaContext } from '../ai/schema-context.js';
import { searchRelevantSchema } from '../ai/qdrant-store.js';
import { createSqlAdapter, createMongoDbAdapter } from '../adapters/factory.js';
import { detectPgVectorCapability } from '../adapters/postgres.js';
import { getCached, setCache, CACHE_TTL, clearSchemaCache } from '../lib/cache.js';
import type { AIProvider, ConnectionProfile, DbKind, AIChatMessage } from '@kamehadb/shared';

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

function buildPostgresVectorPrompt(
  connectionId: string,
  capability: Awaited<ReturnType<typeof detectPgVectorCapability>>,
): string | null {
  if (!capability.available || capability.columns.length === 0) return null;
  const columns = capability.columns
    .slice(0, 8)
    .map((column) => `- ${column.tableSchema}.${column.tableName}.${column.columnName} (${column.dimensions}d)`)
    .join('\n');
  const indexes = capability.indexes
    .slice(0, 8)
    .map(
      (index) => `- ${index.tableSchema}.${index.tableName}.${index.columnName} via ${index.method}/${index.operator}`,
    )
    .join('\n');
  return [
    `This PostgreSQL connection includes pgvector support for ${connectionId}.`,
    'When the user asks for vector similarity search, prefer native pgvector SQL with the vector operators below:',
    '- `<=>` for cosine distance',
    '- `<->` for L2 distance',
    '- `<#>` for inner product',
    'Vector columns:',
    columns,
    indexes ? `Vector indexes:\n${indexes}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

function buildSystemPrompt(
  ddl: string | null,
  mongoSchema: string | null,
  connectionKind?: DbKind,
  postgresVectorPrompt?: string | null,
): string {
  let prompt = `You are a database assistant embedded in a database admin tool called kamehadb. Your job is to help users write queries and understand their data.

Rules:
- Be concise. Put the natural-language answer FIRST, then put the SQL query in a code block at the bottom. Never guess actual row counts or values — you only have the schema.
- Default to read-only queries. If the user asks for a write, note the risk before providing it.
- Always use the correct language tag for the code block (see per-database rules below).`;

  if (connectionKind === 'redis') {
    prompt += `\n\nCurrent connection: Redis.
- Use \`\`\`redis\`\`\` blocks with Redis CLI syntax only.
- Prefer read-only commands: SCAN, TYPE, TTL, MEMORY USAGE, INFO, DBSIZE, HGETALL, LRANGE, SMEMBERS, ZRANGE.
- Do NOT use SQL or JavaScript syntax.`;
  } else if (connectionKind === 'mongodb') {
    prompt += `\n\nCurrent connection: MongoDB.
- Use \`\`\`javascript\`\`\` blocks for all queries (filter, find, aggregate, etc.).
- Do NOT use SQL syntax.
- Write the query using direct shell syntax: \`db.collectionName.find(...)\` or \`db.collectionName.aggregate([...])\`.
- Prefix the query with a comment explaining what it does.`;
  } else if (connectionKind === 'tigerbeetle') {
    prompt += `\n\nCurrent connection: TigerBeetle (financial transaction database).
- Do NOT use SQL, MongoDB, or Redis syntax.
- TigerBeetle is a double-entry accounting database with accounts and transfers.
- Use the TigerBeetle CLI syntax or Node.js client API in \`\`\`javascript\`\`\` blocks.
- Key operations: create_accounts, lookup_accounts, create_transfers, lookup_transfers, get_account_transfers, get_account_balances.
- Accounts have: id (u128), debits_posted, debits_pending, credits_posted, credits_pending, flags, ledger, code.
- Transfers have: id (u128), debit_account_id, credit_account_id, amount, flags, ledger, code.
- Prefer read-only operations: lookup_accounts, lookup_transfers, get_account_balances.`;
  } else if (connectionKind === 'qdrant') {
    prompt += `\n\nCurrent connection: Qdrant (vector database).
- Do NOT use SQL, MongoDB, or Redis syntax.
- Use \`\`\`json\`\`\` blocks for Qdrant REST API request bodies (POST /collections/{name}/points/scroll, /search, /query, etc.).
- For semantic/vector searches, remind the user that a query vector is required — you do not have one, so show the request shape with a placeholder vector.
- For filtering without a vector, use the scroll endpoint with a \`filter\` block.
- Prefer read-only operations: scroll, search, query, get, count.`;
  } else if (connectionKind) {
    prompt += `\n\nCurrent connection: ${connectionKind} (SQL).
- Use \`\`\`sql\`\`\` blocks only. Do NOT use \`\`\`javascript\`\`\` or \`\`\`js\`\`\` — this is a SQL database, not MongoDB.
- The system will automatically run the SQL query and feed the results back to you for your final answer, so you don't need to guess row counts or values.
- Write queries directly without extra back-and-forth.`;
  }

  if (ddl) {
    prompt += `\n\nThe current database schema is:\n\n${ddl}`;
  }

  if (mongoSchema) {
    prompt += `\n\n${mongoSchema}`;
  }

  if (postgresVectorPrompt) {
    prompt += `\n\n${postgresVectorPrompt}`;
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
      messages: z.array(z.object({ role: z.string(), content: z.string() }).passthrough()),
      provider: z.string().optional(),
      model: z.string().optional(),
    }),
  ),
  async (c) => {
    try {
      const body = c.req.valid('json');
      const { connectionId, mongoDatabase } = body;

      const latestUserMsg = body.messages.filter((m) => m.role === 'user').at(-1)?.content;
      if (connectionId && latestUserMsg) {
        metadataStore.saveChatMessage(connectionId, 'user', latestUserMsg, mongoDatabase);
      }

      const settings = metadataStore.getAISettings();
      // Resolve which provider config to use
      const providerName: AIProvider = (body.provider as AIProvider) ?? settings.activeProvider;
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
      let postgresVectorPrompt: string | null = null;
      let connectionKind: DbKind | undefined;
      let profile: ConnectionProfile | null = null;
      if (connectionId) {
        profile = metadataStore.getProfile(connectionId) ?? null;
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
              } else if (profile.kind !== 'redis' && profile.kind !== 'tigerbeetle' && profile.kind !== 'qdrant') {
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
                if (profile.kind === 'postgres') {
                  const vectorCacheKey = `ai-pgvector:${connectionId}`;
                  postgresVectorPrompt = getCached<string>(vectorCacheKey, CACHE_TTL.AI_SCHEMA) ?? null;
                  if (!postgresVectorPrompt) {
                    const capability = await detectPgVectorCapability({
                      host: profile.host,
                      port: profile.port,
                      database: profile.database,
                      username: profile.username,
                      password: password ?? '',
                      ssl: profile.ssl,
                    }).catch(() => null);
                    postgresVectorPrompt = capability ? buildPostgresVectorPrompt(connectionId, capability) : null;
                    if (postgresVectorPrompt) setCache(vectorCacheKey, postgresVectorPrompt);
                  }
                }
              }
            }
          } catch {
            // Silently fail, LLM can work without schema
          }
        }

        if (profile?.kind === 'postgres' && !postgresVectorPrompt) {
          const password = metadataStore.getProfilePassword(connectionId);
          const vectorCacheKey = `ai-pgvector:${connectionId}`;
          postgresVectorPrompt = getCached<string>(vectorCacheKey, CACHE_TTL.AI_SCHEMA) ?? null;
          if (!postgresVectorPrompt) {
            const capability = await detectPgVectorCapability({
              host: profile.host,
              port: profile.port,
              database: profile.database,
              username: profile.username,
              password: password ?? '',
              ssl: profile.ssl,
            }).catch(() => null);
            postgresVectorPrompt = capability ? buildPostgresVectorPrompt(connectionId, capability) : null;
            if (postgresVectorPrompt) setCache(vectorCacheKey, postgresVectorPrompt);
          }
        }
      }

      const systemPrompt = buildSystemPrompt(ddl, mongoSchema, connectionKind, postgresVectorPrompt);
      const llmMessages = [{ role: 'system' as const, content: systemPrompt }, ...body.messages] as AIChatMessage[];

      const provider = createProvider(providerName, config);
      const abortController = new AbortController();
      const isSqlConnection = connectionKind && !['mongodb', 'redis', 'qdrant', 'tigerbeetle'].includes(connectionKind);

      // Extract SQL queries from code fences in LLM output
      function extractSqlQueries(text: string): string[] {
        const queries: string[] = [];
        const sqlRegex = /```sql\n?([\s\S]*?)```/g;
        let match: RegExpExecArray | null;
        while ((match = sqlRegex.exec(text)) !== null) {
          const q = match[1].trim();
          if (q) queries.push(q);
        }
        return queries;
      }

      const generate = async function* () {
        // Step 1: Collect SQL from the LLM silently (not streamed).
        // The user sees a "Thinking..." indicator while this happens.
        let sqlGeneration = '';
        for await (const chunk of provider.chatStream(llmMessages, abortController.signal)) {
          sqlGeneration += chunk;
        }

        let finalAnswer = '';

        // Step 2: Execute any SQL queries found in the LLM's output.
        if (isSqlConnection && connectionId && profile) {
          const sqlQueries = extractSqlQueries(sqlGeneration);
          if (sqlQueries.length > 0) {
            const pwd = metadataStore.getProfilePassword(connectionId);
            const allResults: unknown[] = [];
            let errorMessage: string | null = null;

            for (const query of sqlQueries) {
              const sqlAdapter = createSqlAdapter(profile, pwd);
              if (!sqlAdapter) continue;
              try {
                const result = await sqlAdapter.runQuery({ query });
                allResults.push(...(result.rows ?? []));
              } catch (err) {
                errorMessage = String(err);
              } finally {
                await sqlAdapter.close();
              }
            }

            const resultBlock =
              allResults.length > 0
                ? JSON.stringify(allResults.slice(0, 50), null, 2)
                : JSON.stringify({ error: errorMessage });

            // Step 3: Generate the final answer with real data —
            // answer FIRST as natural language, SQL query in a code block at the bottom.
            const answerMessages: AIChatMessage[] = [
              ...llmMessages,
              { role: 'assistant', content: sqlGeneration },
              {
                role: 'user',
                content: `The SQL query returned these results. Put the answer FIRST as a natural-language sentence, then put the SQL query in a \`\`\`sql\`\`\` code block at the bottom:\n\n${resultBlock}`,
              },
            ];
            for await (const chunk of provider.chatStream(answerMessages, abortController.signal)) {
              finalAnswer += chunk;
              yield `data: ${JSON.stringify({ type: 'content', delta: chunk })}\n\n`;
            }
          }
        }

        // No SQL queries found — just stream the LLM's original response
        if (!finalAnswer) {
          finalAnswer = sqlGeneration;
          yield `data: ${JSON.stringify({ type: 'content', delta: sqlGeneration })}\n\n`;
        }

        // Persist assistant message to history
        if (connectionId && finalAnswer) {
          try {
            metadataStore.saveChatMessage(connectionId, 'assistant', finalAnswer, mongoDatabase);
          } catch (e) {
            console.error('[AI] Failed to save assistant message:', {
              connectionId,
              mongoDatabase,
              contentLength: finalAnswer.length,
              error: e instanceof Error ? e.message : e,
            });
          }
        }

        yield `data: ${JSON.stringify({ type: 'done' })}\n\n`;
      };

      return new Response(
        new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder();
            try {
              for await (const chunk of generate()) {
                controller.enqueue(encoder.encode(chunk));
              }
            } catch (err) {
              const message = err instanceof Error ? err.message : 'Stream error';
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', message })}\n\n`));
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
