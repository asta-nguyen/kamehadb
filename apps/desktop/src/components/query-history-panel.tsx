import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDeleteQueryHistory, useQueryHistory, useUpdateQueryHistory } from '@/hooks/use-query-history';
import { cn } from 'cnfast';
import type { QueryHistoryEntry } from '@kamehadb/shared';
import { Clock, Heart, History, Search, Trash2, X } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { useEffect, useMemo, useRef, useState } from 'react';
import { computeP95, normalizeQuery } from '@/lib/query-normalize';
import { SLOW_QUERY_AI_ACTIONS, SLOW_QUERY_AI_ACTION_ORDER, TOP_N_SLOW_QUERIES } from '@/lib/constants';
import { openAiChatPanel, setPendingAiPrompt } from '@/store';

function formatTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function truncateQuery(query: string, maxLen = 80): string {
  if (query.length <= maxLen) return query;
  return query.slice(0, maxLen) + '...';
}

type QueryHistoryPanelProps = {
  connectionId: number;
  onSelectQuery: (query: string) => void;
  onClose: () => void;
  width?: number;
};

type PatternGroup = {
  pattern: string;
  entries: QueryHistoryEntry[];
  lastEntry: QueryHistoryEntry;
  count: number;
  p95: number | null;
};

export function QueryHistoryPanel({ connectionId, onSelectQuery, onClose, width = 320 }: QueryHistoryPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [widthOverride, setWidthOverride] = useState<number | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const panelWidth = widthOverride ?? width;
  const { data: allEntries, isLoading } = useQueryHistory(connectionId, 100);
  const updateHistory = useUpdateQueryHistory(connectionId);
  const deleteHistory = useDeleteQueryHistory(connectionId);

  // Group by normalized pattern, keep most recent first
  const groups = useMemo(() => {
    if (!allEntries) return [];

    const map = new Map<string, QueryHistoryEntry[]>();
    for (const entry of allEntries) {
      const pattern = normalizeQuery(entry.query);
      const arr = map.get(pattern);
      if (arr) arr.push(entry);
      else map.set(pattern, [entry]);
    }

    const result: PatternGroup[] = [];
    for (const [pattern, entries] of map) {
      entries.sort((a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime());
      // p95 over the durations that are present; entries without durationMs
      // are excluded from the percentile but still counted in `count`.
      const durations = entries.map((e) => e.durationMs).filter((d): d is number => typeof d === 'number');
      result.push({
        pattern,
        entries,
        lastEntry: entries[0],
        count: entries.length,
        p95: computeP95(durations),
      });
    }

    result.sort((a, b) => new Date(b.lastEntry.executedAt).getTime() - new Date(a.lastEntry.executedAt).getTime());
    return result;
  }, [allEntries]);

  // Filter by search text and/or favorites
  const filtered = groups.filter((g) => {
    if (favoritesOnly && !g.lastEntry.favorite) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return g.lastEntry.query.toLowerCase().includes(q) || g.pattern.toLowerCase().includes(q);
    }
    return true;
  });

  // Slow queries: groups with a p95, sorted by p95 descending, capped at top-N.
  // The search filter also applies so the Slow tab respects the current query.
  const slowGroups = useMemo(() => {
    return filtered
      .filter((g) => g.p95 !== null)
      .sort((a, b) => (b.p95 ?? 0) - (a.p95 ?? 0))
      .slice(0, TOP_N_SLOW_QUERIES);
  }, [filtered]);

  const [tab, setTab] = useState<'history' | 'slow'>('history');

  // Pre-seed the AI chat from a slow query. Reuses the Phase 4 pendingAiPrompt
  // store flow: openAiChatPanel scopes the panel to this connection, then
  // setPendingAiPrompt queues the prompt for AIChatPanel to send. No tableId
  // is set — a slow query is not table-scoped, so the sidecar uses full-schema
  // DDL context.
  function handleSlowQueryAiAction(group: PatternGroup, action: 'suggest-index' | 'explain') {
    if (group.p95 === null) return;
    openAiChatPanel(connectionId);
    setPendingAiPrompt({
      prompt: SLOW_QUERY_AI_ACTIONS[action].buildPrompt({
        pattern: group.pattern,
        sampleQuery: group.lastEntry.query,
        p95: group.p95,
        count: group.count,
      }),
    });
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
      const newWidth = Math.max(240, Math.min(600, startWidthRef.current + delta));
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
        aria-label="Resize query history panel"
        tabIndex={0}
        className={`w-1 cursor-col-resize shrink-0 transition-colors ${
          isResizing ? 'bg-primary' : 'bg-border hover:bg-primary/50'
        }`}
      />
      <div className="w-full flex flex-col bg-background">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
          <div className="flex items-center gap-1.5">
            <History className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">Query History</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant={favoritesOnly ? 'secondary' : 'ghost'}
              size="icon"
              className="size-7"
              onClick={() => setFavoritesOnly((v) => !v)}
              title={favoritesOnly ? 'Show all' : 'Favorites only'}
            >
              <Heart className={cn('size-3.5', favoritesOnly && 'fill-red-500 text-red-500')} />
            </Button>
            <Button variant="ghost" size="icon" className="size-7" onClick={onClose} title="Close">
              <X className="size-4" />
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b border-border shrink-0">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              placeholder="Search queries..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-7 h-8 text-xs"
            />
          </div>
        </div>

        {/* Tabs: History / Slow queries */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as 'history' | 'slow')} className="flex-1 flex min-h-0">
          <TabsList className="shrink-0 mx-3 mt-2">
            <TabsTrigger value="history" className="text-xs">
              History
            </TabsTrigger>
            <TabsTrigger value="slow" className="text-xs">
              Slow queries
            </TabsTrigger>
          </TabsList>

          {/* History tab — recency-sorted grouped list (existing behavior) */}
          <TabsContent value="history" className="flex-1 overflow-y-auto min-h-0 mt-0">
            {isLoading && (
              <div className="flex items-center justify-center py-8">
                <Spinner size="md" />
              </div>
            )}

            {!isLoading && filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-xs text-muted-foreground">
                {searchQuery ? 'No matching queries' : 'No query history yet'}
              </div>
            )}

            {!isLoading &&
              filtered.map((group) => {
                const { lastEntry, count } = group;
                return (
                  <div key={group.pattern} className="group border-b border-border/50">
                    {/* Query preview — click to load */}
                    <div
                      className="px-3 pt-2.5 pb-1 cursor-pointer hover:bg-muted/30 transition-colors"
                      onClick={() => onSelectQuery(lastEntry.query)}
                    >
                      <div className="text-xs font-mono leading-relaxed text-foreground/90 line-clamp-2 break-all">
                        {truncateQuery(lastEntry.query)}
                      </div>
                    </div>

                    {/* Stats row */}
                    <div className="px-3 pb-2.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1 shrink-0">
                        <Clock className="size-3" />
                        {formatTime(lastEntry.executedAt)}
                      </span>

                      {lastEntry.durationMs !== undefined && (
                        <span className="shrink-0 font-medium tabular-nums">{lastEntry.durationMs}ms</span>
                      )}

                      <span className="ml-auto flex items-center gap-1">
                        <span className="text-muted-foreground/50">{count}x</span>

                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-5 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation();
                            updateHistory.mutate({ id: lastEntry.id, input: { favorite: !lastEntry.favorite } });
                          }}
                          title={lastEntry.favorite ? 'Unfavorite' : 'Favorite'}
                        >
                          <Heart className={cn('size-3', lastEntry.favorite && 'fill-red-500 text-red-500')} />
                        </Button>

                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-5 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteHistory.mutate(lastEntry.id);
                          }}
                          title="Delete"
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </span>
                    </div>
                  </div>
                );
              })}
          </TabsContent>

          {/* Slow queries tab — top-N by p95 descending */}
          <TabsContent value="slow" className="flex-1 overflow-y-auto min-h-0 mt-0">
            {isLoading && (
              <div className="flex items-center justify-center py-8">
                <Spinner size="md" />
              </div>
            )}

            {!isLoading && slowGroups.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-xs text-muted-foreground">
                {searchQuery ? 'No matching slow queries' : 'No slow queries yet'}
              </div>
            )}

            {!isLoading &&
              slowGroups.map((group) => {
                const { lastEntry, count, p95 } = group;
                return (
                  <div key={group.pattern} className="group border-b border-border/50">
                    {/* Normalized pattern — click to load the most recent raw query */}
                    <div
                      className="px-3 pt-2.5 pb-1 cursor-pointer hover:bg-muted/30 transition-colors"
                      onClick={() => onSelectQuery(lastEntry.query)}
                    >
                      <div className="text-xs font-mono leading-relaxed text-foreground/90 line-clamp-2 break-all">
                        {truncateQuery(group.pattern, 100)}
                      </div>
                      <div className="mt-0.5 text-[10px] font-mono text-muted-foreground/60 line-clamp-1 break-all">
                        {truncateQuery(lastEntry.query, 60)}
                      </div>
                    </div>

                    {/* Stats row: p95 badge, call count, AI action buttons */}
                    <div className="px-3 pb-2.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                      {p95 !== null && (
                        <span className="shrink-0 font-medium tabular-nums text-amber-600 dark:text-amber-500">
                          {p95}ms p95
                        </span>
                      )}
                      <span className="shrink-0 text-muted-foreground/50">{count}x</span>
                      <span className="shrink-0 flex items-center gap-1">
                        <Clock className="size-3" />
                        {formatTime(lastEntry.executedAt)}
                      </span>

                      <span className="ml-auto flex items-center gap-1 shrink-0">
                        {SLOW_QUERY_AI_ACTION_ORDER.map((action) => {
                          const Icon = SLOW_QUERY_AI_ACTIONS[action].icon;
                          return (
                            <Button
                              key={action}
                              variant="ghost"
                              size="icon"
                              className="size-5 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSlowQueryAiAction(group, action);
                              }}
                              title={SLOW_QUERY_AI_ACTIONS[action].label}
                            >
                              <Icon className="size-3" />
                            </Button>
                          );
                        })}
                      </span>
                    </div>
                  </div>
                );
              })}
          </TabsContent>
        </Tabs>
      </div>
    </aside>
  );
}
