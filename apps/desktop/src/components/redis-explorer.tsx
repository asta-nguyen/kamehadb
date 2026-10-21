import { useState, useMemo, type ReactNode } from 'react';
import { useRedisInfiniteKeys, useRedisKeyDetails, useRedisStats } from '@/hooks/use-redis';
import { useQueryClient } from '@tanstack/react-query';
import { debounce } from '@tanstack/pacer';
import { QUERY_KEYS } from '@/lib/query-keys';
import { Box, Hash, List, Type, Clock, X, BarChart3, Cpu, Copy, HardDrive, Users } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { LoadingState } from '@/components/ui/loading-state';
import { EmptyState } from '@/components/ui/empty-state';
import { ExplorerToolbar } from '@/components/ui/explorer-toolbar';
import { JsonValue } from '@/components/ui/json-value';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';
import { toastError, toastSuccess } from '@/lib/toast';
import type { KeyEntry } from '@kamehadb/shared';

const typeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  string: Type,
  hash: Hash,
  list: List,
  set: Box,
  zset: Box,
};

const typeColors: Record<string, string> = {
  string: 'text-accent-foreground',
  hash: 'text-primary',
  list: 'text-secondary-foreground',
  set: 'text-muted-foreground',
  zset: 'text-muted-foreground',
};

function formatValue(value: unknown, type: string): ReactNode {
  if (value === null || value === undefined) return <span className="text-muted-foreground italic">null</span>;

  switch (type) {
    case 'string':
      return <span className="font-mono text-xs bg-muted px-2 py-1 rounded">{String(value)}</span>;
    case 'list':
    case 'set':
    case 'zset':
      if (Array.isArray(value)) {
        return <JsonValue value={value} />;
      }
      break;
    case 'hash':
      if (typeof value === 'object' && value !== null) {
        return <JsonValue value={value} />;
      }
      break;
  }
  return <JsonValue value={value} />;
}

// Converts user input into a Redis MATCH glob pattern.
// Wraps terms without wildcards in *...* for substring matching; preserves explicit glob patterns. (How / Why / What)
function toRedisPattern(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) return '*';
  if (trimmed.includes('*') || trimmed.includes('?') || trimmed.includes('[')) {
    return trimmed;
  }
  return `*${trimmed}*`;
}

interface RedisExplorerProps {
  connectionId: string;
}

export function RedisExplorer({ connectionId }: RedisExplorerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [showStats, setShowStats] = useState(false);

  const queryClient = useQueryClient();

  // Debounce the backend pattern parameter so rapid keystrokes don't fire
  // unnecessary Redis SCAN requests while typing. (How / Why / What)
  const debouncedSetPattern = useMemo(
    () =>
      debounce(
        (q: string) => {
          setDebouncedQuery(q);
        },
        { wait: 300 },
      ),
    [],
  );

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    debouncedSetPattern(val);
  };

  const pattern = useMemo(() => toRedisPattern(debouncedQuery), [debouncedQuery]);

  const {
    data,
    isLoading: loadingKeys,
    isFetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useRedisInfiniteKeys(connectionId, pattern);
  const { data: stats, isLoading: loadingStats, error: statsError } = useRedisStats(connectionId, showStats);

  // Flatten and deduplicate keys across all loaded cursor pages. (How / Why / What)
  const allKeys = useMemo(() => {
    if (!data?.pages) return [];
    const seen = new Set<string>();
    const list: KeyEntry[] = [];
    for (const page of data.pages) {
      for (const k of page.keys) {
        if (!seen.has(k.key)) {
          seen.add(k.key);
          list.push(k);
        }
      }
    }
    return list;
  }, [data?.pages]);

  // Client-side filtering gives immediate feedback while the debounced scan catches up. (What / Why)
  const filteredKeys = useMemo(() => {
    if (!searchQuery.trim()) return allKeys;
    const query = searchQuery.toLowerCase();
    return allKeys.filter((k) => k.key.toLowerCase().includes(query));
  }, [allKeys, searchQuery]);

  const { data: keyDetails } = useRedisKeyDetails(selectedKey ? connectionId : null, selectedKey);

  const handleKeyClick = (key: string) => {
    setSelectedKey(key === selectedKey ? null : key);
  };

  // Shared copy handler for the key context menu: clipboard write plus toast feedback. (What)
  const copyToClipboard = (value: string, label: string) => {
    void navigator.clipboard
      .writeText(value)
      .then(() => toastSuccess(`${label} copied`))
      .catch(() => toastError(`Failed to copy ${label}`));
  };

  // Raw text for "Copy value": strings copy verbatim, structured types as pretty JSON. (What)
  const copyValueText =
    keyDetails && typeof keyDetails.value === 'string' ? keyDetails.value : JSON.stringify(keyDetails?.value, null, 2);

  const handleRefresh = async () => {
    await queryClient.resetQueries({ queryKey: QUERY_KEYS.REDIS_KEYS_INFINITE(connectionId, pattern) });
  };

  return (
    <div className="flex h-full">
      {/* Key list */}
      <div className="w-48 border-r border-border flex flex-col">
        <ExplorerToolbar
          title="Keys"
          count={filteredKeys.length}
          searchValue={searchQuery}
          onSearchChange={handleSearchChange}
          searchPlaceholder="Filter keys..."
          onRefresh={() => void handleRefresh()}
          isRefreshing={isFetching}
          className="border-b border-border"
          actions={
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setShowStats(!showStats)}
              className={showStats ? 'text-primary' : 'text-muted-foreground'}
              title="Show stats"
            >
              <BarChart3 className="size-3" />
            </Button>
          }
        />
        <div className="flex-1 overflow-y-auto min-h-0 p-1.5 space-y-0.5">
          {loadingKeys ? (
            <LoadingState compact />
          ) : filteredKeys.length === 0 ? (
            <EmptyState compact title={allKeys.length === 0 ? 'No keys found' : 'No matches'} />
          ) : (
            <>
              {filteredKeys.map((entry) => {
                const Icon = typeIcons[entry.type] || Box;
                const isSelected = selectedKey === entry.key;
                return (
                  <ContextMenu key={entry.key}>
                    <ContextMenuTrigger>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleKeyClick(entry.key)}
                        className={`w-full font-normal ${isSelected ? 'bg-primary/10 text-primary' : 'hover:bg-muted'}`}
                        title={`${entry.key} (${entry.type})`}
                      >
                        <Icon className={`size-3 shrink-0 ${typeColors[entry.type] || ''}`} />
                        <span className="truncate flex-1 text-left">{entry.key}</span>
                        <span className="text-xs uppercase ml-auto text-muted-foreground/70">{entry.type}</span>
                      </Button>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuItem onClick={() => copyToClipboard(entry.key, 'Key')}>
                        <Copy className="mr-2 size-3.5" />
                        Copy key
                      </ContextMenuItem>
                      {isSelected && keyDetails ? (
                        <ContextMenuItem onClick={() => copyToClipboard(copyValueText, 'Value')}>
                          <Copy className="mr-2 size-3.5" />
                          Copy value
                        </ContextMenuItem>
                      ) : null}
                    </ContextMenuContent>
                  </ContextMenu>
                );
              })}
              {hasNextPage && (
                <div className="pt-2 pb-1 px-1 flex flex-col items-center gap-1 border-t border-border/50">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs"
                    onClick={() => void fetchNextPage()}
                    disabled={isFetchingNextPage}
                  >
                    {isFetchingNextPage ? (
                      <>
                        <Spinner size="sm" className="mr-1.5" />
                        Loading...
                      </>
                    ) : (
                      'Load more keys'
                    )}
                  </Button>
                  <span className="text-[10px] text-muted-foreground">
                    Showing {filteredKeys.length} keys (more available)
                  </span>
                </div>
              )}
            </>
          )}
        </div>
        {showStats && (
          <div className="px-3 py-2 border-t border-border bg-muted/30">
            {loadingStats ? (
              <Spinner size="md" className="mx-auto" />
            ) : statsError ? (
              <div className="text-xs text-destructive">
                Error: {statsError instanceof Error ? statsError.message : 'Failed to load stats'}
              </div>
            ) : stats ? (
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Cpu className="size-3" />
                  <span>{stats.version}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <HardDrive className="size-3" />
                  <span>{stats.totalKeys} keys</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Users className="size-3" />
                  <span>{stats.connectedClients} clients</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span>Memory:</span>
                  <span>{Math.round(stats.usedMemory / 1024 / 1024)} MB</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span>Uptime:</span>
                  <span>{Math.round(stats.uptimeSeconds / 3600)}h</span>
                </div>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">No stats data</span>
            )}
          </div>
        )}
      </div>

      {/* Key details panel */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedKey && keyDetails ? (
          <>
            <div className="px-3 py-2 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                {(() => {
                  const Icon = typeIcons[keyDetails.type] || Box;
                  return <Icon className={`size-4 shrink-0 ${typeColors[keyDetails.type] || ''}`} />;
                })()}
                <ContextMenu>
                  <ContextMenuTrigger className="min-w-0">
                    <span className="font-mono text-sm truncate" title={keyDetails.key}>
                      {keyDetails.key}
                    </span>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem onClick={() => copyToClipboard(keyDetails.key, 'Key')}>
                      <Copy className="mr-2 size-3.5" />
                      Copy key
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => copyToClipboard(copyValueText, 'Value')}>
                      <Copy className="mr-2 size-3.5" />
                      Copy value
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
                <span className="text-xs uppercase bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                  {keyDetails.type}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {keyDetails.ttl > 0 && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="size-3" />
                    TTL: {keyDetails.ttl}s
                  </span>
                )}
                <Button variant="ghost" size="icon-sm" onClick={() => setSelectedKey(null)}>
                  <X className="size-3.5" />
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0 p-3">
              <div className="font-mono text-sm whitespace-pre-wrap break-all">
                {formatValue(keyDetails.value, keyDetails.type)}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            Select a key to view details
          </div>
        )}
      </div>
    </div>
  );
}
