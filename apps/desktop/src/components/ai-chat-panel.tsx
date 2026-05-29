import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { useAiChat, useChatHistory, useClearChatHistory, useClearSchemaCache } from '@/hooks/use-ai-chat';
import { useConnections } from '@/hooks/use-connections';
import { openQueryTabWithSql, navigateTo } from '@/store';
import {
  Bot,
  Send,
  Loader2,
  Sparkles,
  Terminal,
  Play,
  Copy,
  Check,
  Settings2,
  Database,
  X,
  Trash2,
  Hash,
  RefreshCw,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { AIChatMessage } from '@kamehadb/shared';

hljs.registerLanguage('sql', sql);

function getConnectionId(propId: string | null): string | null {
  return propId ?? appStore.state.activeConnectionId;
}

type AIChatPanelProps = {
  connectionId: string | null;
  width?: number;
  onWidthChange?: (width: number) => void;
};

function highlightSql(sql: string): string {
  return hljs.highlight(sql, { language: 'sql' }).value;
}

type BlockType = 'text' | 'sql' | 'error';

function extractSqlBlocks(content: string): { type: BlockType; value: string }[] {
  const blocks: { type: BlockType; value: string }[] = [];

  const errorMatch = content.match(/^error[:\s]*(.+)$/is);
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
      <pre
        className="p-3 text-xs leading-relaxed font-mono overflow-x-auto text-foreground [&_span.keyword]:text-primary [&_span.string]:text-green-600 dark:[&_span.string]:text-green-400 [&_span.number]:text-orange-600 dark:[&_span.number]:text-orange-400 [&_span-comment]:text-muted-foreground/60"
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

function MessageBubble({ msg, connectionId }: { msg: AIChatMessage; connectionId: string | null }) {
  const isUser = msg.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end mb-4">
        <div className="group bg-primary/10 text-sm rounded-2xl rounded-br-md px-3.5 py-2 max-w-[85%] text-foreground/90">
          {msg.content}
        </div>
      </div>
    );
  }

  const blocks = extractSqlBlocks(msg.content);

  return (
    <div className="mb-4">
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider mb-1.5">AI Assistant</div>
        {blocks.map((block, i) =>
          block.type === 'sql' ? (
            <SqlBlock
              key={i}
              sql={block.value}
              onInsert={() => {
                const connId = getConnectionId(connectionId);
                if (!connId) {
                  toast.error('Please select a database first');
                  return;
                }
                const sql = block.value.trim();
                if (!sql) return;
                openNewQueryTab(connId, sql);
              }}
              onRun={() => {
                const connId = getConnectionId(connectionId);
                if (!connId) {
                  toast.error('Please select a database first');
                  return;
                }
                const sql = block.value.trim();
                if (!sql) return;
                openNewQueryTab(connId, sql, true);
              }}
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

function TypingIndicator() {
  return (
    <div className="flex gap-0.5 items-center pt-4 mb-4">
      <span
        className="size-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:0ms]"
        style={{ animationDelay: '0ms' }}
      />
      <span className="size-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:150ms]" />
      <span className="size-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:300ms]" />
    </div>
  );
}

export function AIChatPanel({ connectionId, width = 360, onWidthChange }: AIChatPanelProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AIChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sessionTokens, setSessionTokens] = useState({ input: 0, output: 0 });
  const { data: connections } = useConnections();
  const { data: chatHistory } = useChatHistory(connectionId);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(false);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const aiChat = useAiChat(connectionId);
  const clearChatHistory = useClearChatHistory();
  const clearSchemaCache = useClearSchemaCache();

  const currentConnection = connections?.find((c: (typeof connections)[number]) => c.id === connectionId);

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

    const snapshot = messagesRef.current;
    const userMsg: AIChatMessage = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');

    try {
      const res = await aiChat.mutateAsync({
        messages: [...snapshot, userMsg],
        latestMessage: userMsg,
      });
      setMessages((prev) => [...prev, res.message]);
      // Update session token count
      if (res.usage) {
        setSessionTokens((prev) => ({
          input: prev.input + (res.usage?.inputTokens ?? 0),
          output: prev.output + (res.usage?.outputTokens ?? 0),
        }));
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `Error: ${err instanceof Error ? err.message : 'AI request failed'}`,
        },
      ]);
    } finally {
      sendingRef.current = false;
    }
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
    clearChatHistory.mutate(connectionId);
    setMessages([]);
    setSessionTokens({ input: 0, output: 0 });
  }

  function handleRefreshSchema() {
    if (!connectionId) return;
    clearSchemaCache.mutate(connectionId);
  }

  return (
    <aside className="w-120 border-l border-border bg-background flex flex-col shrink-0 h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-1.5">
          <Sparkles className="size-3.5 text-primary" />
          <span className="text-xs font-medium">AI Assistant</span>
          {sessionTokens.input > 0 && (
            <Tooltip>
              <TooltipTrigger>
                <div className="flex items-center gap-1 text-xs text-muted-foreground/60 cursor-default">
                  <Hash className="size-3" />
                  <span>{(sessionTokens.input + sessionTokens.output).toLocaleString()}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <div className="text-xs">
                  <div>Input: {sessionTokens.input.toLocaleString()} tokens</div>
                  <div>Output: {sessionTokens.output.toLocaleString()} tokens</div>
                </div>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        <TooltipProvider>
          <div className="flex items-center gap-1">
            {currentConnection && (
              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted/50 text-xs">
                <Database className="size-3 text-muted-foreground" />
                {currentConnection.color && (
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: currentConnection.color }} />
                )}
                <span className="text-muted-foreground max-w-24 truncate">{currentConnection.name}</span>
              </div>
            )}
            <Tooltip>
              <TooltipTrigger>
                <Button variant="ghost" size="icon" className="size-7" onClick={() => navigateTo('api-settings')}>
                  <Settings2 className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>API Settings</TooltipContent>
            </Tooltip>
            {currentConnection && (
              <Tooltip>
                <TooltipTrigger>
                  <Button variant="ghost" size="icon" className="size-7" onClick={handleRefreshSchema}>
                    <RefreshCw className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Refresh schema cache</TooltipContent>
              </Tooltip>
            )}
            {messages.length > 0 && (
              <Tooltip>
                <TooltipTrigger>
                  <Button variant="ghost" size="icon" className="size-7" onClick={handleClearHistory}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Clear history</TooltipContent>
              </Tooltip>
            )}
            {onClose && (
              <Tooltip>
                <TooltipTrigger>
                  <Button variant="ghost" size="icon" className="size-7" onClick={onClose}>
                    <X className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Close AI Assistant</TooltipContent>
              </Tooltip>
            )}
          </div>
        </TooltipProvider>
      </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin" ref={scrollRef}>
          <div className="p-4">
            {messages.length === 0 && !aiChat.isPending && (
              <div className="flex text-center py-12 text-muted-foreground">
                <div className="m-auto">
                  <div className="size-12 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center mx-auto mb-3 ring-1 ring-primary/10">
                    <Bot className="size-5 text-primary/60" />
                  </div>
                  <p className="text-sm font-medium text-foreground/70 mb-1">Ask me to write SQL</p>
                  <p className="text-xs text-muted-foreground/60">e.g. "show me users who signed up last month"</p>
                </div>
              </div>
            )}

          {messages.map((msg, i) => (
            <MessageBubble key={i} msg={msg} connectionId={connectionId} />
          ))}

            {aiChat.isPending && <TypingIndicator />}
          </div>
        </div>
      </div>

        <div className="border-t border-border/40 p-3 shrink-0 bg-gradient-to-t from-background to-background/80">
          <div className="flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask AI to write SQL..."
              rows={2}
              className="flex-1 text-sm bg-muted/50 rounded-lg px-3 py-2 resize-none outline-none placeholder:text-muted-foreground/40 border border-transparent focus:border-primary/30 transition-colors"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || aiChat.isPending}
              className="size-9 shrink-0 rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 disabled:pointer-events-none disabled:opacity-50 inline-flex items-center justify-center transition-colors"
            >
              {aiChat.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </button>
          </div>
          <p className="text-xs text-muted-foreground/40 mt-1.5 text-center">
            Enter to send · Shift+Enter for new line
          </p>
        </div>
        <p className="text-xs text-muted-foreground/60 mt-1">Enter to send, Shift+Enter for new line</p>
      </div>
    </aside>
  );
}
