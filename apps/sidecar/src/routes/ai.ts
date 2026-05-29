import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import * as metadataStore from '../db/metadata-store.js';
import { createProvider, validateProviderConfig } from '../ai/provider.js';
import { buildSchemaContext } from '../ai/schema-context.js';
import { createSqlAdapter, createMongoDbAdapter } from '../adapters/factory.js';
import type { AIChatMessage, AIProvider } from '@kamehadb/shared';

export const aiRouter = new Hono();
const providerConfigSchema = z.object({
  enabled: z.boolean(),
  model: z.string(),
  baseUrl: z.string().optional(),
  apiKey: z.string().optional(),
});

async function buildMongoSchemaContext(adapter: ReturnType<typeof createMongoDbAdapter>): Promise<string | null> {
  try {
    const databases = await adapter.listDatabases();

    if (databases.length === 0) {
      return null;
    }

    const lines: string[] = [];
    lines.push('MongoDB Databases:');
    lines.push('');

    // Filter out system databases
    const userDatabases = databases.filter((db) => !['admin', 'local', 'config'].includes(db.name));

    for (const db of userDatabases.slice(0, 10)) {
      // Limit to 10 databases
      lines.push(`## ${db.name}`);

      const collections = await adapter.listCollections(db.name);

      for (const coll of collections.slice(0, 10)) {
        // Limit to 10 collections per database
        const stats = await adapter.getCollectionStats(db.name, coll.name);
        lines.push(`### ${coll.name} (${stats.documentCount.toLocaleString()} docs)`);

        // Get a sample document to show field structure
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

    return lines.join('\n');
  } catch {
    return null;
  }
}

function buildSystemPrompt(ddl: string | null, mongoSchema: string | null): string {
  let prompt = `You are a database assistant embedded in a database admin tool called kamehadb. Your job is to help users write queries and understand their data.

Rules:
- Generate ONLY valid queries — no commentary outside code blocks unless the user asks.
- Use \`\`\`sql ... \`\`\` for SQL queries.
- Use MongoDB aggregation pipeline syntax in \`\`\`javascript ... \`\`\` for MongoDB queries.
- Default to read-only queries. If the user asks for writes, note the risk.
- Be concise.`;

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
        metadataStore.saveChatMessage(body.connectionId, 'user', body.latestMessage.content);
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
      if (body.connectionId) {
        try {
          const profile = metadataStore.getProfile(body.connectionId);
          if (profile) {
            if (profile.kind === 'mongodb') {
              const adapter = createMongoDbAdapter(profile);
              try {
                mongoSchema = await buildMongoSchemaContext(adapter);
              } finally {
                await adapter.close();
              }
            } else {
              const password = metadataStore.getProfilePassword(body.connectionId);
              const adapter = createSqlAdapter(profile, password);
              if (adapter) {
                try {
                  ddl = await buildSchemaContext(adapter);
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

      const systemPrompt = buildSystemPrompt(ddl, mongoSchema);
      console.log('System prompt:', systemPrompt);
      const messages: AIChatMessage[] = [{ role: 'system', content: systemPrompt }, ...body.messages];

      const llmProvider = createProvider(providerName, config);
      const result = await llmProvider.chat(messages);

      // Save assistant response to history
      if (body.connectionId) {
        metadataStore.saveChatMessage(body.connectionId, 'assistant', result.content);
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
  const messages = metadataStore.getChatMessages(connectionId, limit);
  return c.json({ messages });
});

// DELETE /ai/chat-history/:connectionId
aiRouter.delete('/chat-history/:connectionId', async (c) => {
  const connectionId = c.req.param('connectionId');
  metadataStore.clearChatMessages(connectionId);
  return c.json({ success: true });
});
