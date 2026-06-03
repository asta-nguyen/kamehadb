import type { AIChatMessage, AIProvider, AIProviderConfig } from '@kamehadb/shared';

export type ChatResult = {
  content: string;
  inputTokens: number;
  outputTokens: number;
};

export interface LLMProvider {
  chat(messages: AIChatMessage[], signal?: AbortSignal): Promise<ChatResult>;
  chatStream(messages: AIChatMessage[], signal?: AbortSignal): AsyncGenerator<string, void, void>;
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

  async *chatStream(messages: AIChatMessage[], signal?: AbortSignal): AsyncGenerator<string, void, void> {
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
        stream: true,
      }),
      signal,
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`AI API error (${res.status}): ${errBody || res.statusText}`);
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          const data = trimmed.slice(6);
          if (data === '[DONE]') return;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content || '';
            if (delta) {
              yield delta;
            }
          } catch {
            // skip malformed JSON lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

export function createProvider(provider: AIProvider, config: AIProviderConfig): LLMProvider {
  const resolved = resolveProviderConfig(provider, config);
  return new OpenAICompatibleProvider(resolved);
}

function localEmbedding(text: string, dimensions: number = 256): number[] {
  // Simple hash-based embedding — maps words into a fixed-dimension vector
  // using a deterministic hash trick. Good enough for schema retrieval.
  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const vec = new Array(dimensions).fill(0);

  for (const token of tokens) {
    let hash = 0;
    for (let i = 0; i < token.length; i++) {
      hash = (hash << 5) - hash + token.charCodeAt(i);
      hash |= 0; // Convert to 32bit integer
    }
    const idx = Math.abs(hash) % dimensions;
    vec[idx] += 1;
  }

  let mag = 0;
  for (let i = 0; i < dimensions; i++) mag += vec[i] * vec[i];
  mag = Math.sqrt(mag);
  if (mag > 0) for (let i = 0; i < dimensions; i++) vec[i] /= mag;

  return vec;
}

export async function createEmbedding(
  text: string,
  provider: AIProvider,
  config: AIProviderConfig,
  embeddingModel?: string,
): Promise<number[]> {
  const resolved = resolveProviderConfig(provider, config);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (resolved.apiKey) headers['Authorization'] = `Bearer ${resolved.apiKey}`;

  const model = embeddingModel ?? (provider === '9router' ? 'nomic-embed-text' : config.model);

  try {
    const res = await fetch(`${resolved.baseUrl}/embeddings`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        input: text,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.warn(
        `[AI] Embedding API error (${res.status}), falling back to local embedding: ${errBody.slice(0, 100)}`,
      );
      return localEmbedding(text);
    }

    const body = (await res.json()) as {
      data: { embedding: number[] }[];
    };
    return body.data[0]?.embedding ?? localEmbedding(text);
  } catch (err) {
    console.warn(`[AI] Embedding request failed, falling back to local embedding:`, err);
    return localEmbedding(text);
  }
}
