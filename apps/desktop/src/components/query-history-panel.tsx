import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDeleteQueryHistory, useQueryHistory, useUpdateQueryHistory } from '@/hooks/use-query-history';
import { cn } from '@/lib/utils';
import type { QueryHistoryEntry } from '@kamehadb/shared';
import { Clock, Heart, History, Loader2, Search, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';

function normalizeQuery(sql: string): string {
  return sql
    .replace(/'[^']*'/g, '?')
    .replace(/"[^"]*"/g, '?')
    .replace(/\b\d+\b/g, '?')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g, '?')
    .replace(/\s+/g, ' ')
    .trim();
}

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
  connectionId: string;
  onSelectQuery: (query: string) => void;
  onClose: () => void;
};

type PatternGroup = {
  pattern: string;
  entries: QueryHistoryEntry[];
  lastEntry: QueryHistoryEntry;
  count: number;
};

export function QueryHistoryPanel({ connectionId, onSelectQuery, onClose }: QueryHistoryPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const { data: allEntries, isLoading } = useQueryHistory(connectionId, 500);
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
      result.push({
        pattern,
        entries,
        lastEntry: entries[0],
        count: entries.length,
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

  return (
    <div className="w-80 border-l border-border flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-1.5">
          <History className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Performance</span>
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

      {/* List */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
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
      </div>
    </div>
  );
}
