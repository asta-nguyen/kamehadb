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

function buildSystemPrompt(ddl: string | null): string {
  let prompt = `You are a SQL expert assistant embedded in a database admin tool called kamehadb. Your job is to help users write and understand SQL queries.

Rules:
- Generate ONLY valid SQL queries — no commentary outside SQL blocks unless the user asks.
- Use \`\`\`sql ... \`\`\` code blocks for queries.
- Default to read-only SELECT queries. If the user asks for writes, note the risk.
- Be concise.`;

  if (ddl) {
    prompt += `\n\nThe current database schema is:\n\n${ddl}`;
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
      provider: z.enum(['ollama-local', 'ollama-cloud', 'openai', '9router']).optional(),
      model: z.string().optional(),
    }),
  ),
  async (c) => {
    try {
      const body = c.req.valid('json');

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
      if (body.connectionId) {
        try {
          const profile = metadataStore.getProfile(body.connectionId);
          if (profile && profile.kind !== 'mongodb') {
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
        } catch {
          // Silently fail, LLM can work without schema
        }
      }

      const systemPrompt = buildSystemPrompt(ddl);
      const messages: AIChatMessage[] = [{ role: 'system', content: systemPrompt }, ...body.messages];

      const llmProvider = createProvider(providerName, config);
      const result = await llmProvider.chat(messages);

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
