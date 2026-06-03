import { useState, useRef, useEffect, useCallback } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useChatHistory, useClearChatHistory, useClearSchemaCache } from '@/hooks/use-ai-chat';
import { useConnections } from '@/hooks/use-connections';
import { openQueryTabWithSql, navigateTo, appStore } from '@/store';
import hljs from 'highlight.js/lib/core';
import sql from 'highlight.js/lib/languages/sql';
import javascript from 'highlight.js/lib/languages/javascript';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { AIChatMessage } from '@kamehadb/shared';
import { aiChatStream } from '@/lib/api';
import {
  Bot,
  Send,
  Loader2,
  Sparkles,
  Terminal,
  Play,
  Copy,
  Check,
  Database,
  MoreHorizontal,
  Settings2,
  RefreshCw,
  Trash2,
  StopCircle,
  X,
} from 'lucide-react';

hljs.registerLanguage('sql', sql);
hljs.registerLanguage('javascript', javascript);

type CodeLanguage = 'sql' | 'javascript' | 'redis';

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

function highlightCode(code: string, language: CodeLanguage): string {
  if (language === 'redis') return escapeHtml(code);
  return hljs.highlight(code, { language }).value;
}

type AIChatPanelProps = {
  connectionId: string | null;
  width?: number;
  onClose?: () => void;
};

function QueryBlock({
  code,
  language,
  onInsert,
  onRun,
}: {
  code: string;
  language: CodeLanguage;
  onInsert?: () => void;
  onRun?: () => void;
}) {
  const [isCopied, setIsCopied] = useState(false);
  const canOpenSql = language === 'sql' && onInsert && onRun;
  const languageLabel = language === 'javascript' ? 'mongodb' : language;

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 1500);
    } catch (err) {
      console.error('Failed to copy query:', err);
    }
  }, [code]);

  return (
    <div className="my-2 overflow-hidden rounded-md border border-border/70 bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border/70 bg-muted/45 px-2 py-1">
        <span className="font-mono text-xs uppercase tracking-wide text-muted-foreground">{languageLabel}</span>
        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger
              aria-label={`Copy ${languageLabel}`}
              className={buttonVariants({
                variant: 'ghost',
                size: 'icon',
                className: 'size-6 text-muted-foreground hover:text-foreground',
              })}
              onClick={handleCopy}
            >
              {isCopied ? <Check className="size-3" /> : <Copy className="size-3" />}
            </TooltipTrigger>
            <TooltipContent>Copy {languageLabel}</TooltipContent>
          </Tooltip>
          {canOpenSql && (
            <>
              <Tooltip>
                <TooltipTrigger
                  aria-label="Insert SQL into editor"
                  className={buttonVariants({
                    variant: 'ghost',
                    size: 'icon',
                    className: 'size-6 text-muted-foreground hover:text-foreground',
                  })}
                  onClick={onInsert}
                >
                  <Terminal className="size-3" />
                </TooltipTrigger>
                <TooltipContent>Insert into editor</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  aria-label="Run SQL"
                  className={buttonVariants({
                    variant: 'ghost',
                    size: 'icon',
                    className: 'size-6 text-muted-foreground hover:text-foreground',
                  })}
                  onClick={onRun}
                >
                  <Play className="size-3" />
                </TooltipTrigger>
                <TooltipContent>Run SQL</TooltipContent>
              </Tooltip>
            </>
          )}
        </div>
      </div>
      {/* highlight.js v11+ strips/ignores unescaped HTML tags (like <script>)
          rather than emitting entities, so user-supplied tags won't render.
          This safety depends on using hljs.highlight (v11+) and must be
          revisited if the highlighter or version changes. If you swap to a
          different highlighter or feed pre-escaped HTML into highlightCode,
          add explicit sanitization (e.g. DOMPurify) here. */}
      <pre
        className="overflow-x-auto p-2.5 font-mono text-xs leading-relaxed text-foreground bg-muted/30 [&_.hljs-keyword]:[color:var(--syntax-keyword)] [&_.hljs-string]:[color:var(--syntax-string)] [&_.hljs-number]:[color:var(--syntax-number)] [&_.hljs-comment]:[color:var(--syntax-comment)] [&_.hljs-built_in]:[color:var(--syntax-function)] [&_.hljs-title]:[color:var(--syntax-function)] [&_.hljs-attr]:[color:var(--syntax-function)]"
        dangerouslySetInnerHTML={{ __html: highlightCode(code, language) }}
      />
    </div>
  );
}

function normalizeCodeLanguage(language: string): CodeLanguage {
  const normalized = language.toLowerCase();
  if (normalized === 'javascript' || normalized === 'js' || normalized === 'json') return 'javascript';
  if (normalized === 'redis') return 'redis';
  return 'sql';
}

function extractCodeBlocks(content: string): { type: 'text' | 'code'; value: string; language?: CodeLanguage }[] {
  const blocks: { type: 'text' | 'code'; value: string; language?: CodeLanguage }[] = [];
  const regex = /```(sql|javascript|js|json|redis)\n?([\s\S]*?)```/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const text = content.slice(lastIndex, match.index).trim();
      if (text) blocks.push({ type: 'text', value: text });
    }
    blocks.push({ type: 'code', language: normalizeCodeLanguage(match[1]), value: match[2].trim() });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    const text = content.slice(lastIndex).trim();
    if (text) blocks.push({ type: 'text', value: text });
  }

  return blocks;
}

function MessageBubble({ msg, connectionId }: { msg: MessageWithTimestamp; connectionId: string | null }) {
  const [isCopied, setIsCopied] = useState(false);

  function formatTime(date?: Date) {
    if (!date) return '';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  if (msg.role === 'user') {
    return (
      <div className="mb-3 flex justify-end">
        <div className="group max-w-[88%]">
          {msg.timestamp && (
            <div className="mb-0.5 px-1 text-right text-xs text-muted-foreground/45">{formatTime(msg.timestamp)}</div>
          )}
          <div className="whitespace-pre-wrap rounded-2xl rounded-br-md border border-primary/15 bg-primary/10 px-3 py-2 text-sm leading-relaxed text-foreground/90">
            {msg.content}
          </div>
        </div>
      </div>
    );
  }

  const blocks = extractCodeBlocks(msg.content);

  const handleCopyResponse = async () => {
    try {
      await navigator.clipboard.writeText(msg.content);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 1500);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="group mb-3 flex gap-2">
      <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 ring-1 ring-primary/10">
        <Bot className="size-3.5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium text-muted-foreground/70">Assistant</span>
          {msg.timestamp && <span className="text-xs text-muted-foreground/40">{formatTime(msg.timestamp)}</span>}
          <Tooltip>
            <TooltipTrigger
              aria-label="Copy response"
              className={buttonVariants({
                variant: 'ghost',
                size: 'icon',
                className:
                  'ml-auto size-5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100',
              })}
              onClick={handleCopyResponse}
            >
              {isCopied ? <Check className="size-3" /> : <Copy className="size-3" />}
            </TooltipTrigger>
            <TooltipContent>Copy response</TooltipContent>
          </Tooltip>
        </div>
        {blocks.map((block, i) =>
          block.type === 'code' ? (
            <QueryBlock
              key={i}
              code={block.value}
              language={block.language ?? 'sql'}
              onInsert={
                block.language === 'sql'
                  ? () => {
                      if (!connectionId) return;
                      openQueryTabWithSql(connectionId, block.value, false);
                    }
                  : undefined
              }
              onRun={
                block.language === 'sql'
                  ? () => {
                      if (!connectionId) return;
                      openQueryTabWithSql(connectionId, block.value, true);
                    }
                  : undefined
              }
            />
          ) : (
            block.value && (
              <div
                key={i}
                className="text-sm leading-relaxed text-foreground/90 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-1.5 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-2 [&_ul]:list-disc [&_ul]:pl-5"
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{block.value}</ReactMarkdown>
              </div>
            )
          ),
        )}
      </div>
    </div>
  );
}

type MessageWithTimestamp = AIChatMessage & { timestamp?: Date };

const CHAT_MODE_CONFIG = {
  sql: {
    title: 'Ask me to write SQL',
    placeholder: 'Ask AI to write SQL...',
    iconClass: 'bg-primary/10 text-primary ring-primary/15',
    chipClass: 'hover:border-primary/30',
    suggestions: [
      'Show all tables in the database',
      'Count rows in each table',
      'Find tables with indexes',
      'Show database schema',
    ],
  },
  mongodb: {
    title: 'Ask me to write MongoDB queries',
    placeholder: 'Ask AI to write MongoDB queries...',
    iconClass: 'bg-primary/10 text-primary ring-primary/15',
    chipClass: 'hover:border-primary/30',
    suggestions: [
      'Show collections in this database',
      'Count documents per collection',
      'Find collections with indexes',
      'Show sample documents',
    ],
  },
  redis: {
    title: 'Ask me for Redis commands',
    placeholder: 'Ask AI for Redis commands...',
    iconClass: 'bg-destructive/10 text-destructive ring-destructive/20',
    chipClass: 'hover:border-destructive/40',
    suggestions: ['Show keys by pattern', 'Find keys with TTL', 'Check Redis memory usage', 'Explain Redis INFO stats'],
  },
} as const;

export function AIChatPanel({ connectionId, onClose, width = 360 }: AIChatPanelProps) {
  const [panelWidth, setPanelWidth] = useState(width);
  const [isResizing, setIsResizing] = useState(false);
  const [messages, setMessages] = useState<MessageWithTimestamp[]>([]);
  const [input, setInput] = useState('');
  const [streamingContent, setStreamingContent] = useState<string | null>(null);
  const [sqlStatus, setSqlStatus] = useState<string | null>(null);
  const [sessionTokens, setSessionTokens] = useState({ input: 0, output: 0 });
  const { data: connections } = useConnections();

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const clearChatHistory = useClearChatHistory();
  const clearSchemaCache = useClearSchemaCache();

  const currentConnection = connections?.find((c: (typeof connections)[number]) => c.id === connectionId);
  const isMongoDb = currentConnection?.kind === 'mongodb';
  const mongoDatabase = isMongoDb ? (appStore.state.activeMongoDatabase ?? undefined) : undefined;
  const chatMode =
    currentConnection?.kind === 'mongodb'
      ? CHAT_MODE_CONFIG.mongodb
      : currentConnection?.kind === 'redis'
        ? CHAT_MODE_CONFIG.redis
        : CHAT_MODE_CONFIG.sql;

  const { data: chatHistory } = useChatHistory(connectionId, 50, mongoDatabase);

  useEffect(() => {
    if (chatHistory?.messages) {
      setMessages(chatHistory.messages.map((m) => ({ role: m.role, content: m.content })));
    }
  }, [chatHistory]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingContent]);

  async function handleSend(textOverride?: string) {
    const text = (textOverride ?? input).trim();
    if (!text) return;
    if (sendingRef.current) return;
    sendingRef.current = true;

    abortControllerRef.current = new AbortController();

    const snapshot = messagesRef.current;
    const userMsg: MessageWithTimestamp = { role: 'user', content: text, timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');

    setStreamingContent('');
    setSqlStatus(null);

    let accumulated = '';

    try {
      for await (const event of aiChatStream({
        connectionId: connectionId ?? undefined,
        mongoDatabase,
        messages: [...snapshot, { role: userMsg.role, content: userMsg.content }],
        latestMessage: { role: userMsg.role, content: userMsg.content },
        signal: abortControllerRef.current.signal,
      })) {
        if (event.type === 'chunk') {
          accumulated += event.delta;
          setStreamingContent(accumulated);
          setSqlStatus(null);
        } else if (event.type === 'sql_executing') {
          setSqlStatus(`Executing ${event.count} SQL quer${event.count !== 1 ? 'ies' : 'y'}...`);
        } else if (event.type === 'done') {
          setMessages((prev) => [...prev, { role: 'assistant', content: accumulated, timestamp: new Date() }]);
          setStreamingContent(null);
          setSqlStatus(null);
          if (event.inputTokens) {
            setSessionTokens((prev) => ({
              input: prev.input + event.inputTokens,
              output: prev.output + event.outputTokens,
            }));
          }
        } else if (event.type === 'error') {
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: `Error: ${event.message}`, timestamp: new Date() },
          ]);
          setStreamingContent(null);
          setSqlStatus(null);
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant' as const,
          content: `Error: ${err instanceof Error ? err.message : 'AI request failed'}`,
          timestamp: new Date(),
        },
      ]);
      setStreamingContent(null);
      setSqlStatus(null);
    } finally {
      sendingRef.current = false;
      abortControllerRef.current = null;
    }
  }

  function handleStop() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      sendingRef.current = false;
      setStreamingContent(null);
      setSqlStatus(null);
    }
  }

  function handleSuggestionClick(text: string) {
    void handleSend(text);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.repeat) return;
    if ((e.nativeEvent as KeyboardEvent).isComposing) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleClearHistory() {
    if (!connectionId) return;
    clearChatHistory.mutate({ connectionId, mongoDatabase });
    setMessages([]);
    setSessionTokens({ input: 0, output: 0 });
  }

  function handleRefreshSchema() {
    if (!connectionId) return;
    clearSchemaCache.mutate({ connectionId });
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = panelWidth;
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = startXRef.current - e.clientX;
      const newWidth = Math.max(280, Math.min(600, startWidthRef.current + delta));
      setPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  return (
    <aside className="border-l border-border bg-background flex shrink-0 h-full" style={{ width: panelWidth }}>
      <div
        onMouseDown={handleMouseDown}
        className={`w-1 cursor-col-resize shrink-0 transition-colors ${
          isResizing ? 'bg-primary' : 'bg-transparent hover:bg-border/60'
        }`}
      />
      <div className="flex h-full min-w-0 flex-1 flex-col">
        <div className="shrink-0 border-b border-border bg-muted/10 px-3 py-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className={`flex size-6 items-center justify-center rounded-md ring-1 ${chatMode.iconClass}`}>
                  <Sparkles className="size-3.5" />
                </span>
                <span className="truncate text-sm font-medium">AI Assistant</span>
              </div>
              {sessionTokens.input > 0 && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <span className="mt-1 inline-flex rounded bg-muted/70 px-1.5 py-0.5 text-xs text-muted-foreground/70">
                        {(sessionTokens.input + sessionTokens.output).toLocaleString()} tokens
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="text-xs">
                        <div>Input: {sessionTokens.input.toLocaleString()}</div>
                        <div>Output: {sessionTokens.output.toLocaleString()}</div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label="AI assistant menu"
                  className={buttonVariants({
                    variant: 'ghost',
                    size: 'icon',
                    className: 'size-7 text-muted-foreground hover:text-foreground',
                  })}
                >
                  <MoreHorizontal className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => navigateTo('api-settings')}>
                    <Settings2 className="size-4" />
                    Settings
                  </DropdownMenuItem>
                  {currentConnection && (
                    <>
                      <DropdownMenuItem onClick={handleRefreshSchema}>
                        <RefreshCw className="size-4" />
                        Refresh Schema
                      </DropdownMenuItem>
                      {messages.length > 0 && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={handleClearHistory} variant="destructive">
                            <Trash2 className="size-4" />
                            Clear Chat
                          </DropdownMenuItem>
                        </>
                      )}
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              {onClose && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground hover:text-foreground"
                  onClick={onClose}
                >
                  <span className="sr-only">Close</span>
                  <X className="size-4" />
                </Button>
              )}
            </div>
          </div>
          <p className="mt-1 text-xs text-muted-foreground/60">Enter to send, Shift+Enter for new line</p>

          {currentConnection && (
            <div className="mt-2 flex h-6 max-w-full items-center gap-1.5 rounded-md bg-muted/45 px-2 text-xs text-muted-foreground ring-1 ring-border/40">
              <Database className="size-3 shrink-0" />
              {currentConnection.color && (
                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: currentConnection.color }} />
              )}
              <span className="truncate">{currentConnection.name}</span>
              {mongoDatabase && (
                <>
                  <span className="shrink-0 text-muted-foreground/40">/</span>
                  <span className="text-muted-foreground/70 truncate">{mongoDatabase}</span>
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-auto" ref={scrollRef}>
          <div className="p-3 pb-4">
            {messages.length === 0 && streamingContent === null && (
              <div className="py-5 text-muted-foreground">
                <div
                  className={`mx-auto mb-3 flex size-11 items-center justify-center rounded-xl ring-1 ${chatMode.iconClass}`}
                >
                  <Bot className="size-5" />
                </div>
                <p className="mb-1 text-center text-sm font-medium text-foreground/80">{chatMode.title}</p>
                <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                  {chatMode.suggestions.map((prompt, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleSuggestionClick(prompt)}
                      disabled={streamingContent !== null}
                      className={`rounded-full border border-border/50 bg-muted/35 px-2.5 py-1.5 text-xs text-muted-foreground/85 transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50 ${chatMode.chipClass}`}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <MessageBubble key={i} msg={msg} connectionId={connectionId} />
            ))}

            {streamingContent !== null && (
              <MessageBubble
                msg={{ role: 'assistant' as const, content: streamingContent, timestamp: new Date() }}
                connectionId={connectionId}
              />
            )}

            {sqlStatus !== null && (
              <div className="mb-3 flex gap-2">
                <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 ring-1 ring-primary/10">
                  <Database className="size-3.5 text-primary" />
                </div>
                <div className="flex h-7 items-center gap-1.5 rounded-md bg-muted/45 px-2 text-sm text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" />
                  {sqlStatus}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="shrink-0 border-t border-border bg-muted/10 p-2">
          <div className="flex items-end gap-2 rounded-lg border border-border/70 bg-background p-1.5 shadow-sm transition-shadow focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/25">
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={chatMode.placeholder}
              rows={2}
              className="max-h-28 min-h-10 flex-1 resize-none border-0 bg-transparent px-1.5 py-1 text-sm leading-relaxed shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/50"
            />
            {streamingContent !== null ? (
              <Tooltip>
                <TooltipTrigger
                  aria-label="Stop generation"
                  className={buttonVariants({ size: 'icon', className: 'size-8 shrink-0' })}
                  onClick={handleStop}
                >
                  <StopCircle className="size-3.5" />
                </TooltipTrigger>
                <TooltipContent>Stop generation</TooltipContent>
              </Tooltip>
            ) : (
              <Button size="icon" className="size-8 shrink-0" onClick={() => handleSend()} disabled={!input.trim()}>
                <Send className="size-3.5" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
