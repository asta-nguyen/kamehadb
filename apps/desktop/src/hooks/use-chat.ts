import { useState, useRef, useCallback } from 'react';
import { getApiBase } from '@/lib/api';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  parts: Array<{ type: 'text'; content: string }>;
  createdAt?: Date;
};

type UseChatOptions = {
  url: string;
  forwardedProps?: Record<string, unknown>;
};

export function useChat(options: UseChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;

  const sendMessage = useCallback(
    async (text: string) => {
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        parts: [{ type: 'text', content: text }],
        createdAt: new Date(),
      };

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        parts: [{ type: 'text', content: '' }],
        createdAt: new Date(),
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsLoading(true);

      const ac = new AbortController();
      abortRef.current = ac;

      try {
        const payload: Record<string, unknown> = {
          messages: [...messagesRef.current, userMsg].map((m) => ({
            role: m.role,
            content: m.parts[0]?.content ?? '',
          })),
        };
        if (options.forwardedProps) {
          Object.assign(payload, options.forwardedProps);
        }

        const res = await fetch(`${getApiBase()}${options.url}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: ac.signal,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ message: 'Chat request failed' }));
          throw new Error(err.message || `HTTP ${res.status}`);
        }

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data: ')) continue;

            try {
              const data = JSON.parse(trimmed.slice(6));
              if (data.type === 'content' && typeof data.delta === 'string') {
                setMessages((prev) => {
                  const copy = prev.slice();
                  const last = copy[copy.length - 1];
                  if (last?.role === 'assistant') {
                    copy[copy.length - 1] = {
                      ...last,
                      parts: [{ type: 'text', content: last.parts[0].content + data.delta }],
                    };
                  }
                  return copy;
                });
              } else if (data.type === 'error') {
                console.error('[AI] stream error:', data.message);
              }
            } catch {
              // skip malformed JSON
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('[AI] chat error:', err);
        }
      } finally {
        setIsLoading(false);
        abortRef.current = null;
      }
    },
    [options.url, options.forwardedProps],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { messages, isLoading, sendMessage, stop, setMessages };
}
