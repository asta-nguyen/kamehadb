// Pure helpers shared between AI chat UI and tests. Kept dependency-free so
// the unit tests can run without booting React or the TanStack AI stack.

export type CodeLanguage = 'sql' | 'javascript' | 'redis' | 'json';

/**
 * Normalize a markdown code-fence language tag into the chat panel's internal
 * `CodeLanguage` union. JSON gets its own bucket so SQL result blocks tagged
 * ```json aren't re-labeled as MongoDB (the historical bug we're guarding
 * against).
 */
export function normalizeCodeLanguage(language: string): CodeLanguage {
  const normalized = language.toLowerCase();
  if (normalized === 'json') return 'json';
  if (normalized === 'javascript' || normalized === 'js') return 'javascript';
  if (normalized === 'redis') return 'redis';
  return 'sql';
}

/**
 * Visible-text part shape for a chat message. Parts with type 'text' and a
 * string content carry the actual message body — other part types (if any)
 * are ignored when rendering or measuring visible text.
 */
export type ChatTextPart = { type: 'text'; content: string };

// `parts` is typed loosely on purpose: different consumers (TanStack AI,
// custom hook, chat history) may disagree on the exact part union shape.
// We only read `.type` and `.content`, so a permissive shape is both safe
// and necessary.
export type ChatMessageLike = {
  role: 'user' | 'assistant' | 'system';
  parts: ReadonlyArray<{ type: string; content?: unknown }>;
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  parts: Array<ChatTextPart>;
  createdAt?: Date;
};

/**
 * Extract visible text content from a chat message by joining its text parts.
 */
export function getChatTextContent(msg: ChatMessageLike): string {
  return msg.parts
    .filter((p): p is ChatTextPart => p.type === 'text' && typeof p.content === 'string')
    .map((p) => p.content)
    .join('');
}

/**
 * Persisted chat history shape returned by the sidecar's `/ai/chat-history`
 * endpoint. Mirrors the `ChatMessage` row in the metadata store, but kept
 * here as a local type so the desktop package doesn't reach across the
 * workspace boundary just to type this conversion.
 */
export type ChatHistoryMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
};

/**
 * Map a chat history row from the sidecar into a `ChatMessage`.
 * The sidecar returns `createdAt` as an ISO string; the output uses `Date`.
 */
export function toUIMessage(m: ChatHistoryMessage): ChatMessage {
  return {
    id: m.id,
    createdAt: new Date(m.createdAt),
    role: m.role,
    parts: [{ type: 'text' as const, content: m.content }],
  };
}
