import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  useDeleteQueryHistory,
  useFavoriteQueries,
  useQueryHistory,
  useUpdateQueryHistory,
} from '@/hooks/use-query-history';
import { cn } from '@/lib/utils';
import type { QueryHistoryEntry } from '@kamehadb/shared';
import { Clock, Heart, Loader2, Search, Trash2, X } from 'lucide-react';
import { useState } from 'react';

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

function truncateQuery(query: string, maxLen = 100): string {
  if (query.length <= maxLen) return query;
  return query.slice(0, maxLen) + '...';
}

type QueryHistoryPanelProps = {
  connectionId: string;
  onSelectQuery: (query: string) => void;
  onClose: () => void;
};

function QueryHistoryItem({
  entry,
  onSelect,
  onToggleFavorite,
  onDelete,
}: {
  entry: QueryHistoryEntry;
  onSelect: () => void;
  onToggleFavorite: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        'group flex flex-col gap-1 px-3 py-2.5 border-b border-border/50 cursor-pointer',
        'hover:bg-muted/50 transition-colors',
      )}
      onClick={onSelect}
    >
      <div className="text-xs font-mono leading-relaxed text-foreground/90 line-clamp-3 break-all">
        {truncateQuery(entry.query)}
      </div>
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
        <span className="flex items-center gap-1">
          <Clock className="size-3" />
          {formatTime(entry.executedAt)}
        </span>
        {entry.durationMs !== undefined && <span>{entry.durationMs}ms</span>}
        {entry.rowCount !== undefined && (
          <Badge variant="outline" className="text-[10px] px-1 py-0 h-auto font-normal">
            {entry.rowCount} rows
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          title={entry.favorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Heart className={cn('size-3.5', entry.favorite && 'fill-red-500 text-red-500')} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 text-muted-foreground hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title="Delete"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

export function QueryHistoryPanel({ connectionId, onSelectQuery, onClose }: QueryHistoryPanelProps) {
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const { data: allEntries, isLoading } = useQueryHistory(connectionId);
  const { data: favoriteEntries } = useFavoriteQueries(connectionId);
  const updateHistory = useUpdateQueryHistory(connectionId);
  const deleteHistory = useDeleteQueryHistory(connectionId);

  const entries = showFavoritesOnly ? (favoriteEntries ?? []) : (allEntries ?? []);
  const filtered = searchQuery.trim()
    ? entries.filter((e) => e.query.toLowerCase().includes(searchQuery.toLowerCase()))
    : entries;

  return (
    <div className="w-80 border-l border-border flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <span className="text-sm font-medium">Query History</span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className={cn('size-7', showFavoritesOnly && 'text-red-500')}
            onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
            title={showFavoritesOnly ? 'Show all' : 'Favorites only'}
          >
            <Heart className={cn('size-4', showFavoritesOnly && 'fill-red-500')} />
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
            {showFavoritesOnly ? 'No favorite queries yet' : 'No query history'}
          </div>
        )}

        {!isLoading &&
          filtered.map((entry) => (
            <QueryHistoryItem
              key={entry.id}
              entry={entry}
              onSelect={() => onSelectQuery(entry.query)}
              onToggleFavorite={() => updateHistory.mutate({ id: entry.id, input: { favorite: !entry.favorite } })}
              onDelete={() => deleteHistory.mutate(entry.id)}
            />
          ))}
      </div>
    </div>
  );
}
