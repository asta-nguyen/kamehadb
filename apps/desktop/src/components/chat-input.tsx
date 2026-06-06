import { useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button, buttonVariants } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Send, StopCircle } from 'lucide-react';

export function ChatInput({
  isLoading,
  placeholder,
  onSend,
  onStop,
}: {
  isLoading: boolean;
  placeholder: string;
  onSend: (text: string) => void;
  onStop: () => void;
}) {
  const [input, setInput] = useState('');

  function handleSend() {
    const text = input.trim();
    if (!text) return;
    setInput('');
    onSend(text);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.repeat) return;
    if ((e.nativeEvent as KeyboardEvent).isComposing) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="shrink-0 border-t border-border bg-muted/10 p-2">
      <div className="flex items-end gap-2 rounded-lg border border-border/70 bg-background p-1.5 shadow-sm transition-shadow focus-within:border-ring focus-within:ring-ring/25">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={2}
          className="max-h-28 min-h-10 flex-1 resize-none border-0 bg-transparent px-1.5 py-1 text-sm leading-relaxed shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/50"
        />
        {isLoading ? (
          <Tooltip>
            <TooltipTrigger
              aria-label="Stop generation"
              className={buttonVariants({ size: 'icon', className: 'size-8 shrink-0' })}
              onClick={onStop}
            >
              <StopCircle className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent>Stop generation</TooltipContent>
          </Tooltip>
        ) : (
          <Button size="icon" className="size-8 shrink-0" onClick={handleSend} disabled={!input.trim()}>
            <Send className="size-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
