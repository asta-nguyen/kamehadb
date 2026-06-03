import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import * as metadataStore from '../db/metadata-store.js';
import { createProvider, validateProviderConfig } from '../ai/provider.js';
import { buildSchemaContext } from '../ai/schema-context.js';
import {
  searchRelevantSchema,
  searchCollection,
  buildSchemaIndex,
  buildMongoSchemaIndex,
  collectionPointCount,
  collectionPointCountByName,
  mongoCollectionName,
} from '../ai/qdrant-store.js';
import { createSqlAdapter, createMongoDbAdapter } from '../adapters/factory.js';
import { getCached, setCache, CACHE_TTL, clearSchemaCache } from '../lib/cache.js';
import type { AIChatMessage, AIProvider, AISettings, DbKind } from '@kamehadb/shared';
import { expandTerms, renderExpansionsForPrompt } from '@kamehadb/shared';
import { streamSSE } from 'hono/streaming';

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

function buildSystemPrompt(
  ddl: string | null,
  mongoSchema: string | null,
  connectionKind?: DbKind,
  latestUserMessage?: string,
): string {
  let prompt = `You are a database assistant embedded in a database admin tool called kamehadb. Your job is to help users write queries and understand their data.

Rules:
- Be helpful and provide clear answers.
// - Generate ONLY valid queries — no commentary outside code blocks unless the user asks.
- Use \`\`\`sql ... \`\`\` for SQL queries.
- Use MongoDB aggregation pipeline syntax in \`\`\`javascript ... \`\`\` for MongoDB queries.
- Use Redis CLI command syntax in \`\`\`redis ... \`\`\` for Redis commands.
- Default to read-only queries. If the user asks for writes, note the risk.
- Be concise.

Searching for user-supplied terms (Fuzzy matching):
- When the user provides a free-text term to search for, NEVER use exact equality (\`= 'X'\`, \`= 'Y'\`, \`IN ('X')\`, \`{"x": "X"}\`). The stored value is almost never byte-for-byte identical to what the user typed. Examples that must match:
  - Punctuation: user says "landing page", stored is "landing-page" or "landingpage" or "Landing Page".
  - Case: user says "germany", stored is "Germany" or "GERMANY".
  - Codes vs. names: user says "Germany" or "germany" or "de", stored is "DE" or "DEU" or "Germany". Conversely "DE" should also find "Germany" / "Delaware".
  - Plurals / verb forms: user says "live in", stored is "lives in". "User" vs "users", "company" vs "companies".
  - Synonyms: user says "email", stored column is "e_mail" or "mail" or "emailAddress".
  - Whitespace: extra or missing spaces, tabs, newlines.
- General rules:
  - Always use case-insensitive substring matching.
  - Split the user's term on every non-alphanumeric character (spaces, hyphens, slashes, underscores) and OR the fragments together. Each fragment must match somewhere in the value.
  - For each fragment, also match it against the value with the fragment's first letter as a prefix of any word in the value (so "DE" finds "Delaware" / "Denmark" / "Denver" but the prefix rule also lets "DE" find an exact "DE" code).
  - If the value is a known code column (country code, state code, currency code, ISO code, enum abbreviation), ALSO match against the full term as a code by truncating or uppercasing both sides. Concretely: build the OR of (a) substring(lower(value), lower(fragment)) and (b) substring(lower(value), lower(fragment || '%')) so "DE" matches "DE" exactly and "germany" matches "DE" only if "germany" appears as a prefix of any word — but for known code columns, prefer the prefix-anchored form on the full user term.
  - When unsure whether a column stores codes or full names, generate two branches and OR them, then let the SQL engine return the union.
- Per-engine syntax:
  - PostgreSQL: build a single \`column ILIKE ANY(ARRAY['%foo%', '%bar%', ...])\` per fragment group, ORed across groups. Example for "live in germany" against \`country\` and \`bio\`:
    \`\`\`sql
    WHERE (
      country ILIKE ANY(ARRAY['%live%', '%germany%'])
      OR bio ILIKE ANY(ARRAY['%live%', '%germany%'])
      OR country ILIKE ANY(ARRAY['live%', 'germany%'])
      OR bio ILIKE ANY(ARRAY['live%', 'germany%'])
    )
    \`\`\`
    The unanchored \`%x%\` patterns handle "Germany" inside "Germany, Bavaria". The anchored \`x%\` patterns handle code columns like \`country = 'DE'\` where the user's "germany" is the first word of a longer label like "Germany (DE)".
  - MySQL: same shape, with \`LIKE\` (case-insensitive by default) and \`OR\`. If the column uses \`utf8mb4_bin\` or another case-sensitive collation, wrap with \`LOWER(column) LIKE LOWER('%x%')\`.
  - SQLite: \`column LIKE '%x%' COLLATE NOCASE OR column LIKE 'x%' COLLATE NOCASE\`. (For each fragment.)
  - MongoDB: \`{ $or: [ { column: { $regex: 'foo|bar', $options: 'i' } }, { column: { $regex: '^(foo|bar)', $options: 'i' } } ] }\` — unanchored for substrings, anchored for code/prefix.
  - Redis: \`MATCH\` patterns support \`*foo*\`, \`foo*\`, and \`[gG]ermany\` style globs. Combine with \`OR\` by issuing multiple \`SCAN\` calls and unioning the results, since Redis cannot OR inside a single command.
- Never do any of:
  - \`column = 'X'\` on a free-text user term.
  - \`column IN ('X')\` on a free-text user term.
  - Assuming a stored value is normalized (lowercased, hyphen-stripped) without seeing it. Always use substring matching so any of these variants match.`;

  // Inject term expansions as data the model must consume verbatim.
  // The "Term expansions" block lists canonical variants (codes, alternate
  // names, abbreviations) for any term in the user's message. The model
  // is required to include every listed variant in its ILIKE ANY array
  // so a query like "users in germany" still matches rows stored as "DE".
  if (latestUserMessage) {
    const expansions = expandTerms(latestUserMessage);
    const rendered = renderExpansionsForPrompt(expansions);
    if (rendered) {
      prompt += `\n\n${rendered}`;
    }
  }

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

const chatRequestSchema = z.object({
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
});

type ChatRequestBody = z.infer<typeof chatRequestSchema> & { mongoDatabase?: string };

async function buildChatContext(body: ChatRequestBody, settings: AISettings) {
  const providerName: AIProvider = body.provider ?? settings.activeProvider;
  const providerConfig = settings.providers[providerName];
  if (!providerConfig) throw new AIConfigError(`Provider "${providerName}" has no configuration.`);
  if (!providerConfig.enabled) throw new AIConfigError(`Provider "${providerName}" is not enabled.`);

  const validationError = validateProviderConfig(providerName, providerConfig);
  if (validationError) throw new AIConfigError(validationError);

  const config = { ...providerConfig, model: body.model ?? providerConfig.model };

  // Build schema context if connectionId provided
  let ddl: string | null = null;
  let mongoSchema: string | null = null;
  let connectionKind: DbKind | undefined;
  if (body.connectionId) {
    const profile = metadataStore.getProfile(body.connectionId);
    connectionKind = profile?.kind;

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
              if (body.mongoDatabase) {
                const userQuery = body.latestMessage?.role === 'user' ? body.latestMessage.content : undefined;
                const mongoColl = mongoCollectionName(body.connectionId, body.mongoDatabase);
                const pointCount = userQuery ? await collectionPointCountByName(mongoColl).catch(() => 0) : 0;

                if (pointCount > 0) {
                  const relevant = await searchCollection(mongoColl, userQuery!, providerName, config, 5);
                  if (relevant.length > 0) {
                    mongoSchema = relevant.map((r) => r.ddl).join('\n\n');
                  }
                }

                if (!mongoSchema) {
                  const count = await buildMongoSchemaIndex(
                    adapter,
                    body.connectionId,
                    body.mongoDatabase,
                    providerName,
                    config,
                  ).catch(() => 0);
                  if (count > 0) {
                    console.log(
                      `[AI] Indexed ${count} Mongo collections for ${body.connectionId}/${body.mongoDatabase}`,
                    );
                    if (userQuery) {
                      const relevant = await searchCollection(mongoColl, userQuery, providerName, config, 5);
                      if (relevant.length > 0) {
                        mongoSchema = relevant.map((r) => r.ddl).join('\n\n');
                      }
                    }
                  }
                }
              }
              if (!mongoSchema) {
                mongoSchema = await buildMongoSchemaContext(adapter, body.mongoDatabase);
              }
              setCache(cacheKey, mongoSchema);
            } finally {
              await adapter.close();
            }
          } else if (profile.kind !== 'redis') {
            const password = metadataStore.getProfilePassword(body.connectionId);
            const adapter = createSqlAdapter(profile, password);
            if (adapter) {
              try {
                const userQuery = body.latestMessage?.role === 'user' ? body.latestMessage.content : undefined;
                const pointCount = userQuery ? await collectionPointCount(body.connectionId).catch(() => 0) : 0;

                if (pointCount > 0) {
                  const relevant = await searchRelevantSchema(body.connectionId, userQuery!, providerName, config, 5);
                  if (relevant.length > 0) {
                    ddl = relevant.map((r) => r.ddl).join('\n\n');
                  }
                }

                if (!ddl) {
                  const count = await buildSchemaIndex(adapter, body.connectionId, providerName, config).catch(() => 0);
                  if (count > 0) {
                    console.log(`[AI] Indexed ${count} tables for connection ${body.connectionId}`);
                    if (userQuery) {
                      const relevant = await searchRelevantSchema(
                        body.connectionId,
                        userQuery,
                        providerName,
                        config,
                        5,
                      );
                      if (relevant.length > 0) {
                        ddl = relevant.map((r) => r.ddl).join('\n\n');
                      }
                    }
                  }
                  if (!ddl) {
                    ddl = await buildSchemaContext(adapter);
                  }
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

  const latestUserText = body.latestMessage?.role === 'user' ? body.latestMessage.content : undefined;
  const systemPrompt = buildSystemPrompt(ddl, mongoSchema, connectionKind, latestUserText);
  const messages: AIChatMessage[] = [{ role: 'system', content: systemPrompt }, ...body.messages];
  const llmProvider = createProvider(providerName, config);

  return { systemPrompt, messages, llmProvider, providerName, config, connectionKind, ddl, mongoSchema };
}

class AIConfigError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'AIConfigError';
  }
}

// POST /ai/chat (streaming SSE — JSON would break existing callers)
aiRouter.post('/chat', zValidator('json', chatRequestSchema), async (c) => {
  try {
    const body = c.req.valid('json');

    if (body.connectionId && body.latestMessage?.role === 'user') {
      metadataStore.saveChatMessage(body.connectionId, 'user', body.latestMessage.content, body.mongoDatabase);
    }

    const settings = metadataStore.getAISettings();
    const { messages, llmProvider } = await buildChatContext(body, settings);

    return streamSSE(c, async (stream) => {
      try {
        let fullContent = '';

        const execProfile = body.connectionId ? metadataStore.getProfile(body.connectionId) : null;

        const gen1 = llmProvider.chatStream(messages, c.req.raw.signal);
        for await (const chunk of gen1) {
          if (chunk) {
            fullContent += chunk;
            await stream.writeSSE({ data: JSON.stringify({ text: chunk }), event: 'chunk' });
          }
        }

        if (body.connectionId && execProfile && execProfile.kind !== 'mongodb' && execProfile.kind !== 'redis') {
          const sqlMatch = fullContent.match(/```sql\n?([\s\S]*?)```/g);
          if (sqlMatch) {
            const queries = sqlMatch
              .map((m) =>
                m
                  .replace(/```sql\n?/g, '')
                  .replace(/```/g, '')
                  .trim(),
              )
              .filter((q) => /^\s*(SELECT|EXPLAIN|WITH|SHOW|DESCRIBE)\b/i.test(q));

            if (queries.length > 0) {
              await stream.writeSSE({ event: 'sql_executing', data: JSON.stringify({ count: queries.length }) });

              const password = metadataStore.getProfilePassword(body.connectionId);
              const adapter = createSqlAdapter(execProfile, password);
              const results: { sql: string; columns: string[]; rows: Record<string, unknown>[] }[] = [];

              if (adapter) {
                try {
                  for (const query of queries) {
                    try {
                      const queryResult = await adapter.runQuery({ query });
                      results.push({
                        sql: query,
                        columns: queryResult.columns.map((c) => c.name),
                        rows: queryResult.rows.slice(0, 100),
                      });
                    } catch (qErr) {
                      console.warn('[AI] Query failed, skipping:', String(qErr).slice(0, 200));
                    }
                  }
                } finally {
                  await adapter.close();
                }
              }

              if (results.length > 0) {
                const finalMessages: AIChatMessage[] = [
                  ...messages,
                  { role: 'assistant', content: fullContent },
                  {
                    role: 'user',
                    content: `The SQL queries above were executed against the database and returned these results:\n\n${JSON.stringify(results, null, 2)}\n\nNow answer the user's original question using both the SQL queries AND the actual data. Give them the real numbers/records. Include the SQL if relevant. Be concise and helpful.`,
                  },
                ];

                let secondContent = '';
                const gen2 = llmProvider.chatStream(finalMessages, c.req.raw.signal);
                for await (const chunk of gen2) {
                  if (chunk) {
                    secondContent += chunk;
                    await stream.writeSSE({ data: JSON.stringify({ text: chunk }), event: 'chunk' });
                  }
                }

                fullContent = secondContent;

                if (body.connectionId) {
                  metadataStore.saveChatMessage(body.connectionId, 'assistant', fullContent, body.mongoDatabase);
                }

                const inputTokens = Math.ceil(
                  messages.reduce((acc, m) => acc + m.content.length, 0) / 4 +
                    finalMessages.reduce((acc, m) => acc + m.content.length, 0) / 4,
                );
                const outputTokens = Math.ceil(secondContent.length / 4);

                await stream.writeSSE({
                  data: JSON.stringify({ usage: { inputTokens, outputTokens } }),
                  event: 'done',
                });
                return;
              }
            }
          }
        }

        if (body.connectionId) {
          metadataStore.saveChatMessage(body.connectionId, 'assistant', fullContent, body.mongoDatabase);
        }

        const inputTokens = Math.ceil(messages.reduce((acc, m) => acc + m.content.length, 0) / 4);
        const outputTokens = Math.ceil(fullContent.length / 4);

        await stream.writeSSE({
          data: JSON.stringify({ usage: { inputTokens, outputTokens } }),
          event: 'done',
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Streaming error';
        console.error('[AI] streaming error:', msg);
        await stream.writeSSE({ data: JSON.stringify({ error: msg }), event: 'error' });
      }
    });
  } catch (err) {
    if (err instanceof AIConfigError) {
      return c.json({ error: 'AI_CONFIG_ERROR', message: err.message }, 400);
    }
    const message = err instanceof Error ? err.message : 'AI chat stream failed';
    console.error('[AI] chat stream error:', message);
    return c.json({ error: 'AI_ERROR', message }, 500);
  }
});

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
