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

function MessageBubble({ msg, connectionId }: { msg: AIChatMessage; connectionId: string | null }) {
  const isUser = msg.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end mb-3">
        <div className="bg-primary/10 text-sm rounded-lg px-3 py-2 max-w-[85%]">{msg.content}</div>
      </div>
    );
  }

  const blocks = extractSqlBlocks(msg.content);

  return (
    <div className="flex gap-2 mb-3">
      <div className="size-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
        <Bot className="size-3.5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-muted-foreground mb-1">AI</div>
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

export function AIChatPanel({ connectionId, onClose }: AIChatPanelProps) {
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

      <div className="flex-1 overflow-auto" ref={scrollRef}>
        <div className="p-3">
          {messages.length === 0 && !aiChat.isPending && (
            <div className="text-center py-8 text-muted-foreground">
              <Bot className="size-8 mx-auto mb-2 opacity-40" />
              <p className="text-xs">Ask me to write SQL queries</p>
              <p className="text-xs mt-1">e.g. "show me users who signed up last month"</p>
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
          <Button
            size="icon"
            className="size-8 shrink-0 self-end"
            onClick={handleSend}
            disabled={!input.trim() || aiChat.isPending}
          >
            {aiChat.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground/60 mt-1">Enter to send, Shift+Enter for new line</p>
      </div>
    </aside>
  );
}
