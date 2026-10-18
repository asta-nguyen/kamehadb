import { useState, useRef, useCallback } from 'react';
import { safeErrorMessage } from '@kamehadb/shared';
import type { ChatMessage } from '@/lib/ai-chat-helpers';
import { api } from '@/lib/api';
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
  const abortRef = useRef<{ cancel: () => void } | null>(null);
  const requestSeqRef = useRef(0);
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;

  // Shared streaming logic used by both sendMessage and resendFrom: start a
  // backend chat, consume `chat:<id>` events, append deltas to the assistant
  // bubble. The single implementation prevents divergence between call sites.
  async function streamChat(
    messagesPayload: Record<string, unknown>,
    assistantId: string,
    requestSeq: number,
  ): Promise<void> {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    abortRef.current = {
      cancel: () => {
        cancelled = true;
      },
    };

    try {
      const payload: Record<string, unknown> = { ...messagesPayload };
      if (options.forwardedProps) {
        Object.assign(payload, options.forwardedProps);
      }

      const requestId = await api.startChat(payload as never);
      abortRef.current = {
        cancel: () => {
          cancelled = true;
          void api.cancelChat(requestId);
        },
      };

      await new Promise<void>((resolve, reject) => {
        unsubscribe = api.onChatEvent(requestId, (data) => {
          if (cancelled) {
            resolve();
            return;
          }
          if (data.type === 'content' && typeof data.delta === 'string') {
            const delta = data.delta;
            setMessages((prev) => appendAssistantDelta(prev, assistantId, delta));
          } else if (data.type === 'error') {
            reject(new Error(typeof data.message === 'string' ? data.message : 'Chat stream failed'));
          } else if (data.type === 'done') {
            resolve();
          }
        });
      });
    } catch (err) {
      if (!cancelled) {
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
      unsubscribe?.();
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

      abortRef.current?.cancel();
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
    abortRef.current?.cancel();
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
      abortRef.current?.cancel();
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
    abortRef.current?.cancel();
    requestSeqRef.current++;
    setIsLoading(false);
    messagesRef.current = [];
    setMessages([]);
  }, []);

  return { messages, isLoading, sendMessage, stop, setMessages, reset, resendFrom };
}
