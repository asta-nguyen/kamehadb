import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from 'cnfast';
import { Button } from './button';

const MAX_ITEMS = 20;

interface JsonValueProps {
  value: unknown;
  className?: string;
  maxExpandDepth?: number;
}

export function JsonValue({ value, className, maxExpandDepth = 3 }: JsonValueProps) {
  return <JsonValueInner value={value} className={className} depth={0} maxExpandDepth={maxExpandDepth} />;
}

function JsonValueInner({
  value,
  className,
  depth,
  maxExpandDepth,
}: {
  value: unknown;
  className?: string;
  depth: number;
  maxExpandDepth: number;
}) {
  if (value === null) return <span className={cn('text-muted-foreground italic', className)}>null</span>;
  if (value === undefined) return <span className={cn('text-muted-foreground', className)}>-</span>;
  if (typeof value === 'boolean')
    return <span className={cn('text-accent-foreground font-mono text-xs', className)}>{String(value)}</span>;
  if (typeof value === 'number')
    return <span className={cn('text-foreground font-mono text-xs tabular-nums', className)}>{value}</span>;
  if (typeof value === 'string')
    return <span className={cn('text-foreground font-mono text-xs', className)}>{value}</span>;

  if (Array.isArray(value)) {
    return <JsonArray items={value} className={className} depth={depth} maxExpandDepth={maxExpandDepth} />;
  }

  if (typeof value === 'object') {
    return (
      <JsonObject
        obj={value as Record<string, unknown>}
        className={className}
        depth={depth}
        maxExpandDepth={maxExpandDepth}
      />
    );
  }

  return <span className={cn('text-foreground text-xs', className)}>{String(value)}</span>;
}

function JsonArray({
  items,
  className,
  depth,
  maxExpandDepth,
}: {
  items: unknown[];
  className?: string;
  depth: number;
  maxExpandDepth: number;
}) {
  const [expanded, setExpanded] = useState(depth < maxExpandDepth);

  if (items.length === 0) {
    return <span className={cn('text-muted-foreground font-mono text-xs', className)}>[]</span>;
  }

  return (
    <div className={cn('inline-flex flex-col', className)}>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={() => setExpanded(!expanded)}
        className="text-muted-foreground hover:text-foreground h-4 w-4 p-0"
      >
        {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
      </Button>
      <span className="font-mono text-xs">[{items.length}]</span>
      {expanded && (
        <div className="ml-3 border-l border-border/40 pl-2 space-y-0.5">
          {items.slice(0, MAX_ITEMS).map((item, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <span className="text-muted-foreground/60 font-mono text-[10px] w-6 text-right shrink-0 pt-px">{i}</span>
              <JsonValueInner value={item} depth={depth + 1} maxExpandDepth={maxExpandDepth} />
            </div>
          ))}
          {items.length > MAX_ITEMS && (
            <div className="text-[10px] text-muted-foreground pl-7">... and {items.length - MAX_ITEMS} more</div>
          )}
        </div>
      )}
    </div>
  );
}

function JsonObject({
  obj,
  className,
  depth,
  maxExpandDepth,
}: {
  obj: Record<string, unknown>;
  className?: string;
  depth: number;
  maxExpandDepth: number;
}) {
  const [expanded, setExpanded] = useState(depth < maxExpandDepth);
  const entries = Object.entries(obj);

  if (entries.length === 0) {
    return <span className={cn('text-muted-foreground font-mono text-xs', className)}>{'{}'}</span>;
  }

  return (
    <div className={cn('inline-flex flex-col', className)}>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={() => setExpanded(!expanded)}
        className="text-muted-foreground hover:text-foreground h-4 w-4 p-0"
      >
        {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
      </Button>
      <span className="font-mono text-xs">
        {'{'}
        {entries.length}
        {'}'}
      </span>
      {expanded && (
        <div className="ml-3 border-l border-border/40 pl-2 space-y-0.5">
          {entries.map(([key, val]) => (
            <div key={key} className="flex items-start gap-1.5">
              <span className="text-primary/80 font-mono text-xs shrink-0">{key}:</span>
              <JsonValueInner value={val} depth={depth + 1} maxExpandDepth={maxExpandDepth} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
