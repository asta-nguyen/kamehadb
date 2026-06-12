import { useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/variants';
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
    <div className="p-2 bg-muted/10 border-border border-t shrink-0">
      <div className="flex items-end p-1.5 bg-background border-border/70 rounded-lg shadow-xs border gap-2 transition-shadow focus-within:border-ring focus-within:ring-ring/25">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={2}
          className="flex-1 px-1.5 py-1 max-h-28 min-h-10 text-sm leading-relaxed bg-transparent border-0 shadow-none resize-none placeholder:text-muted-foreground/50 focus-visible:ring-0"
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
          <Button size="icon" className="shrink-0 size-8" onClick={handleSend} disabled={!input.trim()}>
            <Send className="size-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
