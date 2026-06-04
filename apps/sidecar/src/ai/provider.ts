import type { AIChatMessage, AIProvider, AIProviderConfig } from '@kamehadb/shared';

export type ChatResult = {
  content: string;
  inputTokens: number;
  outputTokens: number;
};

export interface LLMProvider {
  chat(messages: AIChatMessage[], signal?: AbortSignal): Promise<ChatResult>;
}

type ResolvedConfig = {
  apiKey: string;
  model: string;
  baseUrl: string;
};

export function resolveProviderConfig(provider: AIProvider, config: AIProviderConfig): ResolvedConfig {
  let baseUrl = config.baseUrl?.replace(/\/+$/, '') ?? '';
  let apiKey = config.apiKey ?? '';

  switch (provider) {
    case 'ollama-local':
      baseUrl = baseUrl || 'http://localhost:11434/v1';
      apiKey = apiKey || 'ollama';
      break;
    case 'openai':
      baseUrl = baseUrl || 'https://api.openai.com/v1';
      break;
    case 'ollama-cloud':
    case '9router':
      break;
  }
  return { apiKey, model: config.model.trim(), baseUrl };
}

export function validateProviderConfig(provider: AIProvider, config: AIProviderConfig): string | null {
  if (!config.model) return 'Model is required';

  switch (provider) {
    case 'ollama-local':
      return null; // apiKey optional, baseUrl defaults
    case 'openai':
      if (!config.apiKey) return 'API key is required for OpenAI';
      return null;
    case 'ollama-cloud':
      if (!config.baseUrl) return 'Base URL is required for Ollama Cloud';
      if (!config.apiKey) return 'API key is required for Ollama Cloud';
      return null;
    case '9router':
      if (!config.baseUrl) return 'Base URL is required for 9Router';
      return null;
  }
}

class OpenAICompatibleProvider implements LLMProvider {
  private baseUrl: string;
  private apiKey: string;
  private model: string;

  constructor(resolved: ResolvedConfig) {
    this.baseUrl = resolved.baseUrl;
    this.apiKey = resolved.apiKey;
    this.model = resolved.model;
  }

  async chat(messages: AIChatMessage[], signal?: AbortSignal): Promise<ChatResult> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: false,
      }),
      signal,
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`AI API error (${res.status}): ${errBody || res.statusText}`);
    }

    const body = (await res.json()) as {
      choices: { message: { content: string } }[];
      usage?: { prompt_tokens: number; completion_tokens: number };
    };

    const inputTokens =
      body.usage?.prompt_tokens ?? Math.ceil(messages.reduce((acc, m) => acc + m.content.length, 0) / 4);
    const outputTokens =
      body.usage?.completion_tokens ?? Math.ceil((body.choices[0]?.message?.content ?? '').length / 4);

    return {
      content: body.choices[0]?.message?.content ?? '',
      inputTokens,
      outputTokens,
    };
  }
}

export function createProvider(provider: AIProvider, config: AIProviderConfig): LLMProvider {
  const resolved = resolveProviderConfig(provider, config);
  return new OpenAICompatibleProvider(resolved);
}

// Embed text into a vector using the provider's OpenAI-compatible /embeddings endpoint.
// `model` overrides the provider's chat model, since embedding models differ (e.g. text-embedding-3-small).
export async function createEmbedding(
  provider: AIProvider,
  config: AIProviderConfig,
  text: string,
  model?: string,
  signal?: AbortSignal,
): Promise<number[]> {
  const resolved = resolveProviderConfig(provider, config);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (resolved.apiKey) headers['Authorization'] = `Bearer ${resolved.apiKey}`;

  const res = await fetch(`${resolved.baseUrl}/embeddings`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model: model?.trim() || resolved.model, input: text }),
    signal,
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Embedding API error (${res.status}): ${errBody || res.statusText}`);
  }

  const body = (await res.json()) as { data?: { embedding: number[] }[] };
  const vector = body.data?.[0]?.embedding;
  if (!vector || !Array.isArray(vector)) {
    throw new Error('Embedding response did not contain a vector');
  }
  return vector;
}
