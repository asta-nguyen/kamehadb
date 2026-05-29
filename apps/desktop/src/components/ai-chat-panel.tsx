import { useState, useRef, useEffect } from 'react';
import { useAiChat } from '@/hooks/use-ai-chat';
import { appStore, openNewQueryTab, navigateTo } from '@/store';
import { Bot, Send, Loader2, X, Sparkles, Terminal, Play, Copy, Check, Settings2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import hljs from 'highlight.js';
import sql from 'highlight.js/lib/languages/sql';
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
    <div className="border border-border/50 rounded-lg overflow-hidden bg-card my-2 shadow-sm">
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/50 border-b border-border/30">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-medium text-muted-foreground/70 uppercase tracking-wider">SQL</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(sql);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              } catch (err) {
                console.error('Failed to copy SQL:', err);
              }
            }}
            className="p-1 rounded-sm hover:bg-accent/70 text-muted-foreground hover:text-foreground transition-colors"
            title="Copy"
          >
            {copied ? <Check className="size-2.5" /> : <Copy className="size-2.5" />}
          </button>
          <button
            onClick={onInsert}
            className="p-1 rounded-sm hover:bg-accent/70 text-muted-foreground hover:text-foreground transition-colors"
            title="Insert into editor"
          >
            <Terminal className="size-2.5" />
          </button>
          <button
            onClick={onRun}
            className="p-1 rounded-sm hover:bg-accent/70 text-muted-foreground hover:text-foreground transition-colors"
            title="Run"
          >
            <Play className="size-2.5" />
          </button>
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
              <p key={i} className="text-sm text-foreground/80 leading-relaxed mb-2 first:mt-0 last:mb-0">
                {block.value}
              </p>
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
  const [panelWidth, setPanelWidth] = useState(width);
  const [isResizing, setIsResizing] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(false);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const aiChat = useAiChat(connectionId);

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
      const res = await aiChat.mutateAsync({ messages: [...snapshot, userMsg] });
      setMessages((prev) => [...prev, res.message]);
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

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 size-12 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform z-50"
        title="Open AI Chat"
      >
        <Sparkles className="size-5" />
      </button>
    );
  }

  return (
    <aside
      className="flex h-full border-l border-border/50 bg-gradient-to-b from-background via-background/95 to-muted/20"
      style={{ width: panelWidth, minWidth: panelWidth }}
    >
      <div
        onMouseDown={handleMouseDown}
        className={`w-1 cursor-col-resize shrink-0 transition-all duration-200 ${
          isResizing ? 'bg-primary' : 'bg-transparent hover:bg-border/60'
        }`}
      />
      <div className="flex flex-col h-full flex-1 min-w-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 shrink-0 bg-gradient-to-r from-background to-transparent">
          <div className="flex items-center gap-2">
            <Sparkles className="size-3.5 text-primary" />
            <span className="text-xs font-medium">AI Assistant</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => navigateTo('api-settings')}
              className="p-1.5 rounded-md hover:bg-muted/70 text-muted-foreground hover:text-foreground transition-colors"
              title="API Settings"
            >
              <Settings2 className="size-3.5" />
            </button>
            <button
              onClick={() => setOpen(false)}
              className="p-1.5 rounded-md hover:bg-muted/70 text-muted-foreground hover:text-foreground transition-colors"
              title="Close AI Panel"
            >
              <X className="size-3.5" />
            </button>
          </div>
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
      </div>
    </aside>
  );
}
