import { useState, useCallback, useEffect } from 'react';
import { useMongoDocuments } from '@/hooks/use-mongo';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, AlertCircle, ChevronDown, ChevronRight, Copy, Check } from 'lucide-react';
import type { WorkspaceTab } from '@kamehadb/shared';

function parseJsonSafe(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

interface MongoViewProps {
  tab: Extract<WorkspaceTab, { type: 'mongo' }>;
  connectionId: string;
}

export function MongoView({ tab, connectionId }: MongoViewProps) {
  const { database, collection } = tab;

  const [filterStr, setFilterStr] = useState('{}');
  const [sortStr, setSortStr] = useState('');
  const [limitStr, setLimitStr] = useState('100');
  const [debouncedFilter, setDebouncedFilter] = useState<Record<string, unknown>>({});
  const [debouncedSort, setDebouncedSort] = useState<Record<string, 1 | -1> | undefined>(undefined);
  const [debouncedLimit, setDebouncedLimit] = useState(100);

  // Debounce filter/sort/limit changes
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedFilter(parseJsonSafe(filterStr) ?? {});
    }, 300);
    return () => clearTimeout(timer);
  }, [filterStr]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (sortStr) {
        const parsed = parseJsonSafe(sortStr);
        setDebouncedSort(parsed as Record<string, 1 | -1> | undefined);
      } else {
        setDebouncedSort(undefined);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [sortStr]);

  useEffect(() => {
    const val = parseInt(limitStr, 10);
    if (!isNaN(val) && val > 0) {
      setDebouncedLimit(Math.min(val, 10000));
    }
  }, [limitStr]);

  const { data, isLoading, error, isFetching, refetch } = useMongoDocuments(
    connectionId,
    database,
    collection,
    debouncedFilter,
    debouncedSort,
    debouncedLimit,
  );

  const [expandedDocs, setExpandedDocs] = useState<Set<number>>(new Set());

  const toggleDoc = useCallback((index: number) => {
    setExpandedDocs((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 mb-3">
          <Badge variant="outline" className="text-xs font-mono">
            {database}
          </Badge>
          <span className="text-muted-foreground">/</span>
          <span className="font-medium font-mono">{collection}</span>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap gap-2 items-start">
          <div className="flex-1 min-w-64">
            <label className="text-[10px] text-muted-foreground mb-1 block">Filter (JSON)</label>
            <Input
              value={filterStr}
              onChange={(e) => setFilterStr(e.target.value)}
              placeholder='{"status": "active"}'
              className="h-8 text-xs font-mono"
            />
          </div>
          <div className="w-36">
            <label className="text-[10px] text-muted-foreground mb-1 block">Sort (JSON)</label>
            <Input
              value={sortStr}
              onChange={(e) => setSortStr(e.target.value)}
              placeholder='{"_id": 1}'
              className="h-8 text-xs font-mono"
            />
          </div>
          <div className="w-20">
            <label className="text-[10px] text-muted-foreground mb-1 block">Limit</label>
            <Input
              value={limitStr}
              onChange={(e) => setLimitStr(e.target.value)}
              type="number"
              min="1"
              max="10000"
              className="h-8 text-xs"
            />
          </div>
          <div className="flex items-end gap-1">
            <Button size="sm" variant="outline" onClick={() => refetch()} className="h-8" disabled={isFetching}>
              <RefreshCw className={`size-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* JSON validation */}
        {parseJsonSafe(filterStr) === null && filterStr !== '{}' && (
          <p className="text-[10px] text-destructive mt-1 flex items-center gap-1">
            <AlertCircle className="size-3" />
            Invalid JSON in filter
          </p>
        )}
        {sortStr && parseJsonSafe(sortStr) === null && (
          <p className="text-[10px] text-destructive mt-1 flex items-center gap-1">
            <AlertCircle className="size-3" />
            Invalid JSON in sort
          </p>
        )}
      </div>

      {/* Documents */}
      <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-32 text-destructive">
            <AlertCircle className="size-5 mr-2" />
            {error instanceof Error ? error.message : 'Failed to load documents'}
          </div>
        ) : !data?.documents.length ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground">No documents found</div>
        ) : (
          <>
            {/* Meta */}
            <div className="text-xs text-muted-foreground mb-3 flex items-center justify-between">
              <span>
                {data.documents.length} document{data.documents.length !== 1 ? 's' : ''} returned
                {data.hasMore && <span className="text-amber-600 dark:text-amber-400 ml-1">(has more)</span>}
              </span>
              {isFetching && (
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" />
                  Loading...
                </span>
              )}
            </div>

            {/* Document cards */}
            <div className="space-y-2" role="list">
              {data.documents.map((doc: Record<string, unknown>, index: number) => (
                <DocumentCard
                  key={doc._id ? String(doc._id) : index}
                  doc={doc}
                  isExpanded={expandedDocs.has(index)}
                  onToggle={() => toggleDoc(index)}
                  tabIndex={0}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

interface DocumentCardProps {
  doc: Record<string, unknown>;
  isExpanded: boolean;
  onToggle: () => void;
  tabIndex?: number;
}

function DocumentCard({ doc, isExpanded, onToggle, tabIndex }: DocumentCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(JSON.stringify(doc, null, 2));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // clipboard not available
      }
    },
    [doc],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onToggle();
      }
    },
    [onToggle],
  );

  return (
    <div className="border border-border rounded-md overflow-hidden" role="listitem">
      <button
        onClick={onToggle}
        onKeyDown={handleKeyDown}
        className="w-full flex items-center gap-2 px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors text-left focus:outline-none focus:ring-2 focus:ring-primary/50"
        tabIndex={tabIndex}
        aria-expanded={isExpanded}
      >
        {isExpanded ? (
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="text-xs font-mono truncate flex-1">
          {doc._id ? (
            <span className="text-primary">_id</span>
          ) : (
            <span className="text-muted-foreground italic">no _id</span>
          )}
          {': '}
          <span className="text-foreground">{formatValue(doc._id)}</span>
        </span>
      </button>
      {isExpanded && (
        <div className="px-3 py-2 border-t border-border bg-background relative group">
          <button
            onClick={handleCopy}
            className="absolute top-2 right-2 p-1.5 rounded bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
            title="Copy JSON"
          >
            {copied ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
          </button>
          <pre className="text-xs font-mono whitespace-pre-wrap break-all pr-10">{JSON.stringify(doc, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

function formatValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return `"${value.length > 50 ? value.slice(0, 50) + '...' : value}"`;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
