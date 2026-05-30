import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAiChat, useChatHistory, useClearChatHistory, useClearSchemaCache } from '@/hooks/use-ai-chat';
import { useConnections } from '@/hooks/use-connections';
import { appStore, navigateTo, openQueryTabWithSql } from '@/store';
import type { AIChatMessage } from '@kamehadb/shared';
import hljs from 'highlight.js';
import sql from 'highlight.js/lib/languages/sql';
import {
  AlertCircle,
  Bot,
  Check,
  Copy,
  Database,
  Loader2,
  MoreHorizontal,
  Play,
  RefreshCw,
  Send,
  Settings2,
  Sparkles,
  StopCircle,
  Terminal,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

hljs.registerLanguage('sql', sql);

type AIChatPanelProps = {
  connectionId: string | null;
  width?: number;
  onWidthChange?: (width: number) => void;
  onClose?: () => void;
};

function highlightSql(sql: string): string {
  return hljs.highlight(sql, { language: 'sql' }).value;
}

type BlockType = 'text' | 'sql' | 'error';

function extractSqlBlocks(content: string): { type: BlockType; value: string }[] {
  const blocks: { type: BlockType; value: string }[] = [];

  const errorMatch = content.match(/^error\b[:\s]*(.+)$/is);
  if (errorMatch) {
    blocks.push({ type: 'error', value: errorMatch[1].trim() });
    content = content.slice(errorMatch[0].length).trim();
  }

  const regex = /```sql\n?([\s\S]*?)```/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const text = content.slice(lastIndex, match.index).trim();
      if (text) blocks.push({ type: 'text', value: text });
    }
    blocks.push({ type: 'sql', value: match[1].trim() });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    const text = content.slice(lastIndex).trim();
    if (text) blocks.push({ type: 'text', value: text });
  }

  return blocks;
}

function SqlBlock({ sql, onInsert, onRun }: { sql: string; onInsert: () => void; onRun: () => void }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="border border-border/50 rounded-lg overflow-hidden bg-card my-2 shadow-sm">
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/50 border-b border-border/30">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-medium text-muted-foreground/70 uppercase tracking-wider">SQL</span>
        </div>
        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button variant="ghost" size="icon-xs">
                  {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
                </Button>
              }
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(sql);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                } catch (err) {
                  console.error('Failed to copy SQL:', err);
                }
              }}
            />
            <TooltipContent>Copy SQL</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button variant="ghost" size="icon-xs">
                  <Terminal className="size-3" />
                </Button>
              }
              onClick={onInsert}
            />
            <TooltipContent>Insert into editor</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button variant="ghost" size="icon-xs">
                  <Play className="size-3" />
                </Button>
              }
              onClick={onRun}
            />
            <TooltipContent>Run SQL</TooltipContent>
          </Tooltip>
        </div>
      </div>
      <pre
        className="p-3 text-xs leading-relaxed font-mono overflow-x-auto text-foreground [&_.hljs-keyword]:text-primary [&_.hljs-string]:text-green-600 dark:[&_.hljs-string]:text-green-400 [&_.hljs-number]:text-orange-600 dark:[&_.hljs-number]:text-orange-400 [&_.hljs-comment]:text-muted-foreground/60"
        dangerouslySetInnerHTML={{ __html: highlightSql(sql) }}
      />
    </div>
  );
}

function ErrorBlock({ message }: { message: string }) {
  return (
    <div className="border border-destructive/30 rounded-lg overflow-hidden bg-destructive/5 my-2">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-destructive/10 border-b border-destructive/20">
        <AlertCircle className="size-3 text-destructive" />
        <span className="text-xs font-medium text-destructive/80 uppercase tracking-wider">Error</span>
      </div>
      <p className="p-3 text-xs text-destructive/90 leading-relaxed">{message}</p>
    </div>
  );
}

function MessageBubble({ msg, connectionId }: { msg: MessageWithTimestamp; connectionId: string | null }) {
  const [copied, setCopied] = useState(false);
  const isUser = msg.role === 'user';

  function formatTime(date?: Date) {
    if (!date) return '';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  if (isUser) {
    return (
      <div className="flex justify-end mb-3">
        <div className="group max-w-[85%]">
          {msg.timestamp && (
            <div className="text-xs text-muted-foreground/50 text-right mb-0.5 px-1">{formatTime(msg.timestamp)}</div>
          )}
          <div className="bg-primary/10 text-sm rounded-2xl rounded-br-md px-3 py-2 text-foreground/90">
            {msg.content}
          </div>
        </div>
      </div>
    );
  }

  const blocks = extractSqlBlocks(msg.content);
  const resolveConnectionId = () => connectionId ?? appStore.state.activeConnectionId;
  const insertSqlToEditor = (sql: string) => {
    const targetConnectionId = resolveConnectionId();
    if (!targetConnectionId) return;
    openQueryTabWithSql(targetConnectionId, sql, false);
  };
  const runSqlImmediately = (sql: string) => {
    const targetConnectionId = resolveConnectionId();
    if (!targetConnectionId) return;
    openQueryTabWithSql(targetConnectionId, sql, true);
  };

  return (
    <div className="flex gap-2 mb-3">
      <div className="size-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
        <Bot className="size-3.5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider">AI Assistant</span>
          {msg.timestamp && <span className="text-xs text-muted-foreground/40">{formatTime(msg.timestamp)}</span>}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button variant="ghost" size="icon-xs" className="ml-auto">
                  {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
                </Button>
              }
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(msg.content);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                } catch (err) {
                  console.error('Failed to copy:', err);
                }
              }}
            />
            <TooltipContent>Copy response</TooltipContent>
          </Tooltip>
        </div>
        {blocks.map((block, i) =>
          block.type === 'sql' ? (
            <SqlBlock
              key={i}
              sql={block.value}
              onInsert={() => insertSqlToEditor(block.value)}
              onRun={() => runSqlImmediately(block.value)}
            />
          ) : block.type === 'error' ? (
            <ErrorBlock key={i} message={block.value} />
          ) : (
            block.value && (
              <div
                key={i}
                className="text-sm [&_p]:mb-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_code]:bg-muted [&_code]:px-1 [&_code]:rounded [&_pre]:bg-muted [&_pre]:p-2 [&_pre]:rounded-md [&_pre]:overflow-x-auto"
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

const SUGGESTION_PROMPTS = [
  'Show all tables in the database',
  'Count rows in each table',
  'Find tables with indexes',
  'Show database schema',
];

export function AIChatPanel({ connectionId, onClose, width = 360, onWidthChange }: AIChatPanelProps) {
  const [panelWidth, setPanelWidth] = useState(width);
  const [isResizing, setIsResizing] = useState(false);
  const [messages, setMessages] = useState<MessageWithTimestamp[]>([]);
  const [input, setInput] = useState('');
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

  const aiChat = useAiChat(connectionId);
  const clearChatHistory = useClearChatHistory();
  const clearSchemaCache = useClearSchemaCache();

  const currentConnection = connections?.find((c: (typeof connections)[number]) => c.id === connectionId);
  const isMongoDb = currentConnection?.kind === 'mongodb';
  const mongoDatabase = isMongoDb ? (appStore.state.activeMongoDatabase ?? undefined) : undefined;

  const { data: chatHistory } = useChatHistory(connectionId, 50, mongoDatabase);

  // Load chat history on mount
  useEffect(() => {
    if (chatHistory?.messages) {
      setMessages(chatHistory.messages.map((m) => ({ role: m.role, content: m.content })));
    }
  }, [chatHistory]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, aiChat.isPending]);

  useEffect(() => {
    setPanelWidth(width);
  }, [width]);

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
      const newWidth = Math.max(280, Math.min(560, startWidthRef.current + delta));
      setPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      onWidthChange?.(panelWidth);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, panelWidth, onWidthChange]);

  async function handleSend() {
    const text = input.trim();
    if (!text) return;
    if (sendingRef.current) return;
    sendingRef.current = true;

    // Create new AbortController for this request
    abortControllerRef.current = new AbortController();

    const snapshot = messagesRef.current;
    const userMsg: MessageWithTimestamp = { role: 'user', content: text, timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');

    try {
      const res = await aiChat.mutateAsync({
        messages: [...snapshot, { role: userMsg.role, content: userMsg.content }],
        latestMessage: { role: userMsg.role, content: userMsg.content },
        signal: abortControllerRef.current.signal,
        mongoDatabase,
      });
      setMessages((prev) => [...prev, { ...res.message, timestamp: new Date() }]);
      // Update session token count
      if (res.usage) {
        setSessionTokens((prev) => ({
          input: prev.input + (res.usage?.inputTokens ?? 0),
          output: prev.output + (res.usage?.outputTokens ?? 0),
        }));
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Request was cancelled
        return;
      }
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant' as const,
          content: `Error: ${err instanceof Error ? err.message : 'AI request failed'}`,
          timestamp: new Date(),
        },
      ]);
    } finally {
      sendingRef.current = false;
      abortControllerRef.current = null;
    }
  }

  function handleStop() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      sendingRef.current = false;
    }
  }

  function handleSuggestionClick(text: string) {
    setInput(text);
    inputRef.current?.focus();
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

  return (
    <aside
      className="flex h-full border-l border-border/50 bg-linear-to-b from-background via-background/95 to-muted/20"
      style={{ width: panelWidth, minWidth: panelWidth }}
    >
      <div
        onMouseDown={handleMouseDown}
        className={`w-1 cursor-col-resize shrink-0 transition-all duration-200 ${
          isResizing ? 'bg-primary' : 'bg-transparent hover:bg-border/60'
        }`}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="border-b border-border px-3 py-2 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <Sparkles className="size-4 shrink-0 text-primary" />
              <span className="truncate text-sm font-medium">AI Assistant</span>
              {sessionTokens.input > 0 && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger className="rounded bg-muted/60 px-1.5 py-0.5 text-xs text-muted-foreground/50">
                      {(sessionTokens.input + sessionTokens.output).toLocaleString()} tokens
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

            <div className="flex items-center gap-1 shrink-0">
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button variant="ghost" size="icon-sm">
                      <MoreHorizontal className="size-4" />
                    </Button>
                  }
                />
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
                <Button variant="ghost" size="icon-sm" onClick={onClose}>
                  <span className="sr-only">Close</span>
                  <X className="size-4" />
                </Button>
              )}
            </div>
          </div>

          {currentConnection && (
            <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Database className="size-3 shrink-0" />
              {currentConnection.color && (
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: currentConnection.color }} />
              )}
              <span className="truncate">{currentConnection.name}</span>
              {mongoDatabase && (
                <>
                  <span className="text-muted-foreground/40">/</span>
                  <span className="truncate text-muted-foreground/70">{mongoDatabase}</span>
                </>
              )}
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-auto" ref={scrollRef}>
          <div className="p-3">
            {messages.length === 0 && !aiChat.isPending && (
              <div className="py-6 text-center text-muted-foreground">
                <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 ring-1 ring-primary/10">
                  <Bot className="size-5 text-primary/60" />
                </div>
                <p className="mb-1 text-sm font-medium text-foreground/70">Ask me to write SQL</p>
                <p className="mb-4 text-xs text-muted-foreground/60">Try one of these:</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {SUGGESTION_PROMPTS.map((prompt, i) => (
                    <button
                      key={i}
                      onClick={() => handleSuggestionClick(prompt)}
                      className="rounded-full border border-border/50 bg-muted/60 px-3 py-1.5 text-xs text-muted-foreground/80 transition-colors hover:border-primary/30 hover:bg-muted hover:text-foreground"
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

            {aiChat.isPending && (
              <div className="mb-3 flex gap-2">
                <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Bot className="size-3.5 text-primary" />
                </div>
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" />
                  Thinking...
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="shrink-0 border-t border-border p-2">
          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask AI to write SQL..."
              rows={2}
              className="min-h-16 flex-1 resize-none rounded-md bg-muted px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground/50"
            />
            {aiChat.isPending ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button size="icon" className="shrink-0 self-end">
                      <StopCircle className="size-3.5" />
                    </Button>
                  }
                  onClick={handleStop}
                />
                <TooltipContent>Stop generation</TooltipContent>
              </Tooltip>
            ) : (
              <Button size="icon" className="shrink-0 self-end" onClick={handleSend} disabled={!input.trim()}>
                <Send className="size-3.5" />
              </Button>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground/60">Enter to send, Shift+Enter for new line</p>
        </div>
      </div>
    </aside>
  );
}
