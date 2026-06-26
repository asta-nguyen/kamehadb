import { ChatInput } from '@/components/chat-input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { buttonVariants } from '@/components/ui/variants';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useChat } from '@/hooks/use-chat';
import { useConnections } from '@/hooks/use-connections';
import {
  buildHighlightedCodeTree,
  getChatTextContent,
  normalizeCodeLanguage,
  toUIMessage,
  type ChatMessage,
  type CodeLanguage,
  type SafeHighlightNode,
} from '@/lib/ai-chat-helpers';
import { appStore, navigateTo, openQueryTabWithSql } from '@/store';
import {
  Bot,
  Check,
  Copy,
  Database,
  MoreHorizontal,
  Pencil,
  Play,
  RefreshCw,
  Settings2,
  Sparkles,
  Terminal,
  Trash2,
  X,
} from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { useCallback, useEffect, useRef, useState, Fragment } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { QUERY_KEYS } from '@/lib/query-keys';

/**
 * Render the pre-sanitized highlight tree without ever injecting raw HTML.
 * The helper already strips unsafe scope/class data, so this renderer only
 * needs to map text and span nodes into React elements recursively.
 */
function renderHighlightNodes(nodes: SafeHighlightNode[], keyPrefix = 'code'): React.ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;
    if (node.type === 'text') return <Fragment key={key}>{node.value}</Fragment>;

    return (
      <span key={key} className={node.className}>
        {renderHighlightNodes(node.children, key)}
      </span>
    );
  });
}

type AIChatPanelProps = {
  connectionId: string | null;
  width?: number;
  onClose?: () => void;
};

type ReadonlyQueryBlock = {
  variant: 'readonly';
  code: string;
  language: CodeLanguage;
};

type ExecutableQueryBlock = {
  variant: 'executable';
  code: string;
  language: CodeLanguage;
  connectionId: string;
  onInsert: () => void;
  onRun: () => void;
};

type QueryBlockProps = ReadonlyQueryBlock | ExecutableQueryBlock;

function QueryBlock(props: QueryBlockProps) {
  const [isCopied, setIsCopied] = useState(false);
  const languageLabel = props.language === 'javascript' && props.variant === 'executable' ? 'mongodb' : props.language;

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(props.code);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 1500);
    } catch (err) {
      console.error('Failed to copy query:', err);
    }
  }, [props.code]);

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
          {props.variant === 'executable' && (
            <>
              <Tooltip>
                <TooltipTrigger
                  aria-label="Insert SQL into editor"
                  className={buttonVariants({
                    variant: 'ghost',
                    size: 'icon',
                    className: 'size-6 text-muted-foreground hover:text-foreground',
                  })}
                  onClick={props.onInsert}
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
                  onClick={props.onRun}
                >
                  <Play className="size-3" />
                </TooltipTrigger>
                <TooltipContent>Run SQL</TooltipContent>
              </Tooltip>
            </>
          )}
        </div>
      </div>
      <pre className="overflow-x-auto p-2.5 font-mono text-xs leading-relaxed text-foreground bg-muted/30 [&_.hljs-keyword]:[color:var(--syntax-keyword)] [&_.hljs-string]:[color:var(--syntax-string)] [&_.hljs-number]:[color:var(--syntax-number)] [&_.hljs-comment]:[color:var(--syntax-comment)] [&_.hljs-built_in]:[color:var(--syntax-function)] [&_.hljs-title]:[color:var(--syntax-function)] [&_.hljs-attr]:[color:var(--syntax-function)]">
        {renderHighlightNodes(buildHighlightedCodeTree(props.code, props.language))}
      </pre>
    </div>
  );
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

function formatChatTime(date?: Date) {
  if (!date) return '';
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return (
    date.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
    ', ' +
    date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  );
}

type UserMessageProps = {
  msg: ChatMessage;
  onResend?: (messageId: string, newText: string) => void;
  disabled?: boolean;
};

function UserMessage({ msg, onResend, disabled }: UserMessageProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const startEdit = () => {
    setDraft(getChatTextContent(msg));
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft('');
  };

  const submitEdit = () => {
    const trimmed = draft.trim();
    if (!trimmed || !onResend) return;
    setEditing(false);
    onResend(msg.id, trimmed);
  };

  return (
    <div className="mb-3 flex justify-end">
      <div className="group max-w-[88%]">
        {msg.createdAt && (
          <div className="mb-0.5 px-1 text-right text-xs text-muted-foreground/45">{formatChatTime(msg.createdAt)}</div>
        )}
        {editing ? (
          <div className="rounded-2xl rounded-br-md border border-primary/15 bg-primary/10 px-3 py-2 text-sm">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submitEdit();
                } else if (e.key === 'Escape') {
                  cancelEdit();
                }
              }}
              className="w-full resize-none bg-transparent text-sm leading-relaxed text-foreground/90 outline-none min-h-20"
              autoFocus
            />
            <div className="mt-1 flex justify-end gap-1">
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={cancelEdit}>
                Cancel
              </Button>
              <Button variant="default" size="sm" className="h-6 text-xs" onClick={submitEdit} disabled={!draft.trim()}>
                Send
              </Button>
            </div>
          </div>
        ) : (
          <div className="whitespace-pre-wrap break-words rounded-2xl rounded-br-md border border-primary/15 bg-primary/10 px-3 py-2 text-sm leading-relaxed text-foreground/90">
            {getChatTextContent(msg)}
          </div>
        )}
        {!editing && onResend && (
          <div className="mt-0.5 flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <Button
              variant="ghost"
              size="sm"
              className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
              onClick={startEdit}
              disabled={disabled}
            >
              <Pencil className="size-2.5" />
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
              onClick={() => onResend(msg.id, getChatTextContent(msg))}
              disabled={disabled}
            >
              <RefreshCw className="size-2.5" />
              Resend
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

type StreamingAssistantMessageProps = {
  msg: ChatMessage;
};

function StreamingAssistantMessage({ msg: _msg }: StreamingAssistantMessageProps) {
  return (
    <div className="group mb-3 flex gap-2">
      <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 ring-1 ring-primary/10">
        <Bot className="size-3.5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex h-7 items-center gap-1.5 text-sm text-muted-foreground">
          <Spinner size="sm" />
          Thinking...
        </div>
      </div>
    </div>
  );
}

function AssistantMessageHeader({
  msg,
  onCopy,
  isCopied,
}: {
  msg: ChatMessage;
  onCopy: () => void;
  isCopied: boolean;
}) {
  return (
    <div className="flex items-center gap-2 mb-1">
      <span className="text-xs font-medium text-muted-foreground/70">Assistant</span>
      {msg.createdAt && <span className="text-xs text-muted-foreground/40">{formatChatTime(msg.createdAt)}</span>}
      <Tooltip>
        <TooltipTrigger
          aria-label="Copy response"
          className={buttonVariants({
            variant: 'ghost',
            size: 'icon',
            className:
              'ml-auto size-5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100',
          })}
          onClick={onCopy}
        >
          {isCopied ? <Check className="size-3" /> : <Copy className="size-3" />}
        </TooltipTrigger>
        <TooltipContent>Copy response</TooltipContent>
      </Tooltip>
    </div>
  );
}

type AssistantMessageProps = {
  msg: ChatMessage;
  connectionId: string | null;
};

function AssistantMessage({ msg, connectionId }: AssistantMessageProps) {
  const [isCopied, setIsCopied] = useState(false);
  const content = getChatTextContent(msg);
  const blocks = extractCodeBlocks(content);

  const handleCopyResponse = async () => {
    try {
      await navigator.clipboard.writeText(content);
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
        <AssistantMessageHeader msg={msg} onCopy={handleCopyResponse} isCopied={isCopied} />
        {blocks.map((block) =>
          block.type === 'code' ? (
            block.language === 'sql' && connectionId ? (
              <QueryBlock
                key={block.value}
                variant="executable"
                code={block.value}
                language={block.language ?? 'sql'}
                connectionId={connectionId}
                onInsert={() => openQueryTabWithSql(connectionId, block.value, false)}
                onRun={() => openQueryTabWithSql(connectionId, block.value, true)}
              />
            ) : (
              <QueryBlock key={block.value} variant="readonly" code={block.value} language={block.language ?? 'sql'} />
            )
          ) : (
            block.value && (
              <div
                key={block.value.slice(0, 50)}
                className="break-words text-sm leading-relaxed text-foreground/90 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-1.5 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-2 [&_ul]:list-disc [&_ul]:pl-5"
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
  const [widthOverride, setWidthOverride] = useState<number | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const panelWidth = widthOverride ?? width;
  const { data: connections } = useConnections();

  const scrollRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const historyLoadedRef = useRef(false);
  const prevConnectionIdRef = useRef(connectionId);

  const currentConnection = connections?.find((c: (typeof connections)[number]) => c.id === connectionId);
  const isMongoDb = currentConnection?.kind === 'mongodb';
  const mongoDatabase = isMongoDb ? (appStore.state.activeMongoDatabase ?? undefined) : undefined;
  const chatMode =
    currentConnection?.kind === 'mongodb'
      ? CHAT_MODE_CONFIG.mongodb
      : currentConnection?.kind === 'redis'
        ? CHAT_MODE_CONFIG.redis
        : CHAT_MODE_CONFIG.sql;

  const chat = useChat({
    url: '/ai/chat',
    forwardedProps: connectionId ? { connectionId, mongoDatabase } : undefined,
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chat.messages]);

  const queryClient = useQueryClient();

  const clearChatHistory = useMutation({
    mutationFn: (args: { connectionId: string; mongoDatabase?: string }) =>
      api.clearChatHistory(args.connectionId, args.mongoDatabase),
    onSuccess: (_data, args) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CHAT_HISTORY(args.connectionId, args.mongoDatabase) });
    },
  });
  const clearSchemaCache = useMutation({
    mutationFn: (args: { connectionId: string }) => api.clearSchemaCache(args.connectionId),
    onSuccess: (_data, args) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CHAT_HISTORY(args.connectionId) });
    },
  });

  const { data: chatHistory } = useQuery({
    queryKey: QUERY_KEYS.CHAT_HISTORY(connectionId, mongoDatabase),
    queryFn: () => api.getChatHistory(connectionId!, 50, mongoDatabase),
    enabled: !!connectionId,
  });

  useEffect(() => {
    if (chatHistory?.messages && chat.messages.length === 0 && !historyLoadedRef.current) {
      historyLoadedRef.current = true;
      const uiMessages: ChatMessage[] = chatHistory.messages.map(toUIMessage);
      chat.setMessages(uiMessages);
    }
  }, [chatHistory, chat]);

  useEffect(() => {
    if (prevConnectionIdRef.current !== connectionId) {
      prevConnectionIdRef.current = connectionId;
      chat.setMessages([]);
      historyLoadedRef.current = false;
    }
  }, [connectionId, chat]);

  function handleSuggestionClick(text: string) {
    chat.sendMessage(text);
  }

  function handleStop() {
    chat.stop();
  }

  function handleClearHistory() {
    if (!connectionId) return;
    clearChatHistory.mutate({ connectionId, mongoDatabase });
    chat.setMessages([]);
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
      setWidthOverride(newWidth);
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
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize AI chat panel"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleMouseDown(e as unknown as React.MouseEvent);
          }
        }}
        className={`w-1 cursor-col-resize shrink-0 transition-colors border-0 m-0 ${
          isResizing ? 'bg-primary' : 'bg-transparent hover:bg-border/60'
        }`}
      />
      <div className="flex h-full min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
        <div className="shrink-0 border-b border-border bg-muted/10 px-3 py-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className={`flex size-6 items-center justify-center rounded-md ring-1 ${chatMode.iconClass}`}>
                  <Sparkles className="size-3.5" />
                </span>
                <span className="truncate text-sm font-medium">AI Assistant</span>
              </div>
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
                      {chat.messages.length > 0 && (
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

        <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="p-3 pb-4">
            {chat.messages.length === 0 && !chat.isLoading && (
              <div className="py-5 text-muted-foreground">
                <div
                  className={`mx-auto mb-3 flex size-11 items-center justify-center rounded-xl ring-1 ${chatMode.iconClass}`}
                >
                  <Bot className="size-5" />
                </div>
                <p className="mb-1 text-center text-sm font-medium text-foreground/80">{chatMode.title}</p>
                <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                  {chatMode.suggestions.map((prompt) => (
                    <Button
                      key={prompt}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleSuggestionClick(prompt)}
                      disabled={chat.isLoading}
                      className={`rounded-full bg-muted/35 text-muted-foreground/85 hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50 ${chatMode.chipClass}`}
                    >
                      {prompt}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {chat.messages.map((msg, i) => {
              const isLastAssistant = chat.isLoading && i === chat.messages.length - 1 && msg.role === 'assistant';
              if (msg.role === 'user') {
                return <UserMessage key={msg.id} msg={msg} onResend={chat.resendFrom} disabled={chat.isLoading} />;
              }
              if (isLastAssistant) {
                return <StreamingAssistantMessage key={msg.id} msg={msg} />;
              }
              return <AssistantMessage key={msg.id} msg={msg} connectionId={connectionId} />;
            })}
          </div>
        </div>

        <ChatInput
          isLoading={chat.isLoading}
          placeholder={chatMode.placeholder}
          onSend={(t) => chat.sendMessage(t)}
          onStop={handleStop}
        />
      </div>
    </aside>
  );
}
