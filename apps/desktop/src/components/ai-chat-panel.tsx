import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { useAiChat, useChatHistory, useClearChatHistory, useClearSchemaCache } from '@/hooks/use-ai-chat';
import { useConnections } from '@/hooks/use-connections';
import { openQueryTabWithSql, navigateTo, appStore } from '@/store';
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
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { AIChatMessage } from '@kamehadb/shared';

type AIChatPanelProps = {
  connectionId: string | null;
  onClose?: () => void;
};

function SqlBlock({ sql, onInsert, onRun }: { sql: string; onInsert: () => void; onRun: () => void }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="border rounded-md overflow-hidden bg-card my-2">
      <div className="flex items-center justify-between px-2 py-1 bg-muted border-b border-border">
        <span className="text-xs text-muted-foreground">sql</span>
        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger>
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(sql);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  } catch (err) {
                    console.error('Failed to copy SQL:', err);
                  }
                }}
              >
                {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copy SQL</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger>
              <Button variant="ghost" size="icon" className="size-6" onClick={onInsert}>
                <Terminal className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Insert into editor</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger>
              <Button variant="ghost" size="icon" className="size-6" onClick={onRun}>
                <Play className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Run SQL</TooltipContent>
          </Tooltip>
        </div>
      </div>
      <pre className="p-2 text-xs font-mono overflow-x-auto text-foreground">{sql}</pre>
    </div>
  );
}

function extractSqlBlocks(content: string): { type: 'text' | 'sql'; value: string }[] {
  const blocks: { type: 'text' | 'sql'; value: string }[] = [];
  const regex = /```sql\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      blocks.push({ type: 'text', value: content.slice(lastIndex, match.index).trim() });
    }
    blocks.push({ type: 'sql', value: match[1].trim() });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    blocks.push({ type: 'text', value: content.slice(lastIndex).trim() });
  }

  return blocks;
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
            <TooltipTrigger>
              <Button
                variant="ghost"
                size="icon"
                className="size-5 ml-auto"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(msg.content);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  } catch (err) {
                    console.error('Failed to copy:', err);
                  }
                }}
              >
                {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copy response</TooltipContent>
          </Tooltip>
        </div>
        {blocks.map((block, i) =>
          block.type === 'sql' ? (
            <SqlBlock
              key={i}
              sql={block.value}
              onInsert={() => {
                if (!connectionId) return;
                openQueryTabWithSql(connectionId, block.value, false);
              }}
              onRun={() => {
                if (!connectionId) return;
                openQueryTabWithSql(connectionId, block.value, true);
              }}
            />
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

export function AIChatPanel({ connectionId, onClose }: AIChatPanelProps) {
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
    <aside className="w-120 border-l border-border bg-background flex flex-col shrink-0 h-full">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <span className="text-sm font-medium">AI Assistant</span>
            {sessionTokens.input > 0 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <span className="text-xs text-muted-foreground/50 px-1.5 py-0.5 rounded bg-muted/60">
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

          <div className="flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger>
                <Button variant="ghost" size="icon" className="size-7">
                  <MoreHorizontal className="size-4" />
                </Button>
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
              <Button variant="ghost" size="icon" className="size-7" onClick={onClose}>
                <span className="sr-only">Close</span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-4"
                >
                  <path d="M18 6 6l-12 12M6 6l12 12" />
                </svg>
              </Button>
            )}
          </div>
        </div>

        {/* Connection info */}
        {currentConnection && (
          <div className="flex items-center gap-1.5 mt-1.5 text-xs text-muted-foreground">
            <Database className="size-3" />
            {currentConnection.color && (
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: currentConnection.color }} />
            )}
            <span className="truncate">{currentConnection.name}</span>
            {mongoDatabase && (
              <>
                <span className="text-muted-foreground/40">/</span>
                <span className="text-muted-foreground/70 truncate">{mongoDatabase}</span>
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto" ref={scrollRef}>
        <div className="p-3">
          {messages.length === 0 && !aiChat.isPending && (
            <div className="text-center py-6 text-muted-foreground">
              <div className="size-12 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center mx-auto mb-3 ring-1 ring-primary/10">
                <Bot className="size-5 text-primary/60" />
              </div>
              <p className="text-sm font-medium text-foreground/70 mb-1">Ask me to write SQL</p>
              <p className="text-xs text-muted-foreground/60 mb-4">Try one of these:</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {SUGGESTION_PROMPTS.map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => handleSuggestionClick(prompt)}
                    className="text-xs px-3 py-1.5 rounded-full bg-muted/60 hover:bg-muted border border-border/50 hover:border-primary/30 transition-colors text-muted-foreground/80 hover:text-foreground"
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
            <div className="flex gap-2 mb-3">
              <div className="size-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
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

      <div className="border-t border-border p-2 shrink-0">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask AI to write SQL..."
            rows={2}
            className="flex-1 text-sm bg-muted rounded-md px-2 py-1.5 resize-none outline-none placeholder:text-muted-foreground/50"
          />
          {aiChat.isPending ? (
            <Tooltip>
              <TooltipTrigger>
                <Button size="icon" className="size-8 shrink-0 self-end" onClick={handleStop}>
                  <StopCircle className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Stop generation</TooltipContent>
            </Tooltip>
          ) : (
            <Button size="icon" className="size-8 shrink-0 self-end" onClick={handleSend} disabled={!input.trim()}>
              <Send className="size-3.5" />
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground/60 mt-1">Enter to send, Shift+Enter for new line</p>
      </div>
    </aside>
  );
}
