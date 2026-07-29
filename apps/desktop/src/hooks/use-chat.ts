import { useState, useRef, useCallback } from 'react';
import { safeErrorMessage } from '@kamehadb/shared';
import type { ChatMessage } from '@/lib/ai-chat-helpers';
import { getApiBase } from '@/lib/api-client';
import { appendFrontendLog } from '@/lib/app-logs';

type UseChatOptions = {
  url: string;
  forwardedProps?: Record<string, unknown>;
};

export function appendAssistantDelta(messages: ChatMessage[], assistantId: string, delta: string): ChatMessage[] {
  return messages.map((message) => {
    if (message.id !== assistantId || message.role !== 'assistant') {
      return message;
    }

    return {
      ...message,
      parts: [{ type: 'text', content: `${message.parts[0]?.content ?? ''}${delta}` }],
    };
  });
}

export function useChat(options: UseChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const requestSeqRef = useRef(0);
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;

  // Shared SSE-streaming logic used by both sendMessage and resendFrom.
  // Builds the payload, POSTs to the chat endpoint, reads NDJSON lines from
  // the response body, and calls onDelta for each content delta. The single
  // implementation prevents divergence between the two call sites.
  async function streamChat(
    messagesPayload: Record<string, unknown>,
    assistantId: string,
    requestSeq: number,
  ): Promise<void> {
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const payload: Record<string, unknown> = { ...messagesPayload };
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

      if (!res.body) throw new Error('Chat response stream was empty');
      const reader = res.body.getReader();
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

          let data: { type?: unknown; delta?: unknown; message?: unknown };
          try {
            data = JSON.parse(trimmed.slice(6)) as typeof data;
          } catch {
            continue;
          }

          if (data.type === 'content' && typeof data.delta === 'string') {
            const delta = data.delta;
            setMessages((prev) => appendAssistantDelta(prev, assistantId, delta));
          } else if (data.type === 'error') {
            throw new Error(typeof data.message === 'string' ? data.message : 'Chat stream failed');
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        const message = safeErrorMessage(err, String(err));
        if (requestSeqRef.current === requestSeq) {
          // Keep partial output visible and attach the failure where the empty
          // assistant bubble would otherwise make the request look successful.
          setMessages((prev) =>
            prev.map((item) => {
              if (item.id !== assistantId) return item;
              const content = item.parts[0]?.content ?? '';
              return {
                ...item,
                parts: [{ type: 'text', content: content ? `${content}\n\nError: ${message}` : `Error: ${message}` }],
              };
            }),
          );
        }
        void appendFrontendLog({
          level: 'error',
          scope: 'use-chat',
          message: `AI chat error: ${message}`,
          stack: err instanceof Error ? err.stack : undefined,
        });
      }
    } finally {
      if (requestSeqRef.current === requestSeq) {
        setIsLoading(false);
        abortRef.current = null;
      }
    }
  }

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

      abortRef.current?.abort();
      const requestSeq = ++requestSeqRef.current;
      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsLoading(true);

      await streamChat(
        {
          messages: [...messagesRef.current, userMsg].map((m) => ({
            role: m.role,
            content: m.parts[0]?.content ?? '',
          })),
        },
        assistantMsg.id,
        requestSeq,
      );
    },
    [options.url, options.forwardedProps],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const resendFrom = useCallback(
    async (messageId: string, newText: string) => {
      const prevMessages = messagesRef.current;
      const msgIndex = prevMessages.findIndex((m) => m.id === messageId);
      if (msgIndex === -1) return;

      // Keep everything before the edited user message, replace its content,
      // and drop the old assistant response that followed it.
      const updatedUserMsg: ChatMessage = {
        ...prevMessages[msgIndex],
        parts: [{ type: 'text', content: newText }],
      };

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        parts: [{ type: 'text', content: '' }],
        createdAt: new Date(),
      };

      const baseMessages = [...prevMessages.slice(0, msgIndex), updatedUserMsg];
      abortRef.current?.abort();
      const requestSeq = ++requestSeqRef.current;
      setMessages([...baseMessages, assistantMsg]);
      setIsLoading(true);

      await streamChat(
        {
          messages: [...baseMessages].map((m) => ({
            role: m.role,
            content: m.parts[0]?.content ?? '',
          })),
        },
        assistantMsg.id,
        requestSeq,
      );
    },
    [options.url, options.forwardedProps],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    requestSeqRef.current++;
    messagesRef.current = [];
    setMessages([]);
  }, []);

  return { messages, isLoading, sendMessage, stop, setMessages, reset, resendFrom };
}
