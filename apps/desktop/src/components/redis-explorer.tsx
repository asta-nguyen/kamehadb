import { useState, useMemo } from 'react';
import { useRedisKeys, useRedisKeyPage, useRedisStats } from '@/hooks/use-redis';
import {
  Box,
  Hash,
  List,
  Type,
  Clock,
  X,
  BarChart3,
  Cpu,
  Copy,
  HardDrive,
  Users,
  ChevronRight,
  RotateCcw,
} from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { LoadingState } from '@/components/ui/loading-state';
import { EmptyState } from '@/components/ui/empty-state';
import { ExplorerToolbar } from '@/components/ui/explorer-toolbar';
import { JsonValue } from '@/components/ui/json-value';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';
import { toastError, toastSuccess } from '@/lib/toast';
import type { RedisValuePage, RedisStringWindow, RedisHashPair, RedisZsetMember } from '@kamehadb/shared';

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

const VALUE_PAGE_SIZE = 100;

function isStringWindow(v: unknown): v is RedisStringWindow {
  return typeof v === 'object' && v !== null && 'start' in v && 'total' in v;
}

// Renders one bounded page of a key's value. Partial pages are labelled and
// never presented as the complete original value. (What/Why)
function PageValue({ page }: { page: RedisValuePage }) {
  const { type, value } = page;
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground italic">empty</span>;
  }
  switch (type) {
    case 'string': {
      if (!isStringWindow(value)) return <JsonValue value={value} />;
      return (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">
            Bytes {value.start}–{value.end} of {value.total}
            {value.encoding === 'base64' ? ' · base64 (binary)' : ''}
            {page.hasMore ? ' · partial — not the complete value' : ' · complete'}
          </div>
          <span className="font-mono text-xs bg-muted px-2 py-1 rounded whitespace-pre-wrap break-all block">
            {value.data}
          </span>
        </div>
      );
    }
    case 'list':
    case 'set': {
      const members = Array.isArray(value) ? (value as string[]) : [];
      return (
        <ul className="space-y-1">
          {members.map((m, i) => (
            <li key={i} className="font-mono text-xs bg-muted px-2 py-1 rounded break-all">
              {m}
            </li>
          ))}
        </ul>
      );
    }
    case 'zset': {
      const members = Array.isArray(value) ? (value as RedisZsetMember[]) : [];
      return (
        <ul className="space-y-1">
          {members.map((m, i) => (
            <li key={i} className="font-mono text-xs bg-muted px-2 py-1 rounded break-all flex gap-2">
              <span className="text-muted-foreground shrink-0">{m.scoreText ?? m.score}</span>
              <span className="break-all">{m.member}</span>
            </li>
          ))}
        </ul>
      );
    }
    case 'hash': {
      const pairs = Array.isArray(value) ? (value as RedisHashPair[]) : [];
      return (
        <ul className="space-y-1">
          {pairs.map((p, i) => (
            <li key={i} className="font-mono text-xs bg-muted px-2 py-1 rounded break-all flex gap-2">
              <span className="text-muted-foreground shrink-0">{p.field}:</span>
              <span className="break-all">{p.value}</span>
            </li>
          ))}
        </ul>
      );
    }
    default:
      return <JsonValue value={value} />;
  }
}

interface RedisExplorerProps {
  connectionId: string;
}

export function RedisExplorer({ connectionId }: RedisExplorerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [showStats, setShowStats] = useState(false);
  // Cursor history for First/Next browsing. Cursors are opaque strings bound
  // to this connection + pattern; a pattern change restarts from the first page.
  const [cursorStack, setCursorStack] = useState<(string | undefined)[]>([undefined]);
  const currentCursor = cursorStack[cursorStack.length - 1];
  const [valueCursorStack, setValueCursorStack] = useState<(string | undefined)[]>([undefined]);
  const currentValueCursor = valueCursorStack[valueCursorStack.length - 1];

  // Search text is a substring filter, not a glob: escape SCAN glob
  // metacharacters and wrap in * so the server pattern matches keys
  // containing the literal text. The cursor stays bound to this pattern.
  const scanPattern = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return '*';
    return `*${q.replace(/[\\*?[\]]/g, '\\$&')}*`;
  }, [searchQuery]);
  const {
    data: keysResult,
    isLoading: loadingKeys,
    isFetching,
    error: keysError,
    refetch,
  } = useRedisKeys(connectionId, scanPattern, currentCursor);
  const { data: stats, isLoading: loadingStats, error: statsError } = useRedisStats(connectionId, showStats);

  const {
    data: keyPage,
    isFetching: fetchingPage,
    error: keyPageError,
  } = useRedisKeyPage(selectedKey ? connectionId : null, selectedKey, currentValueCursor, VALUE_PAGE_SIZE);

  const filteredKeys = useMemo(() => {
    if (!keysResult?.keys) return [];
    if (!searchQuery.trim()) return keysResult.keys;
    const query = searchQuery.toLowerCase();
    return keysResult.keys.filter((k) => k.key.toLowerCase().includes(query));
  }, [keysResult?.keys, searchQuery]);

  const handleSearchChange = (q: string) => {
    setSearchQuery(q);
    setCursorStack([undefined]);
  };

  const handleKeyClick = (key: string) => {
    setSelectedKey(key === selectedKey ? null : key);
    setValueCursorStack([undefined]);
  };

  // Shared copy handler for the key context menu: clipboard write plus toast feedback. (What)
  const copyToClipboard = (value: string, label: string) => {
    void navigator.clipboard
      .writeText(value)
      .then(() => toastSuccess(`${label} copied`))
      .catch(() => toastError(`Failed to copy ${label}`));
  };

  // Copying an incomplete page would hand out a truncated value disguised as
  // the original — only complete pages offer "Copy value". Partial string
  // windows get a labelled "Copy segment" instead. (Why)
  const copyValueText =
    keyPage?.complete && keyPage.value !== undefined
      ? keyPage.type === 'string' && isStringWindow(keyPage.value)
        ? keyPage.value.data
        : JSON.stringify(keyPage.value, null, 2)
      : undefined;
  const segmentText = keyPage?.type === 'string' && isStringWindow(keyPage.value) ? keyPage.value.data : undefined;

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
          onRefresh={() => void refetch()}
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
          ) : keysError ? (
            <div className="px-2 py-1 text-xs text-destructive">
              {keysError instanceof Error ? keysError.message : 'Failed to scan keys'}
            </div>
          ) : filteredKeys.length === 0 ? (
            <EmptyState
              compact
              title={
                // An empty page with hasMore is a non-terminal SCAN batch, not
                // exhaustion — tell the user to keep paging instead.
                keysResult?.keys?.length === 0
                  ? keysResult && !keysResult.done
                    ? 'No keys on this page — Next continues scanning'
                    : 'No keys found'
                  : 'No matches'
              }
            />
          ) : (
            filteredKeys.map((entry) => {
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
                    {isSelected && copyValueText !== undefined ? (
                      <ContextMenuItem onClick={() => copyToClipboard(copyValueText, 'Value')}>
                        <Copy className="mr-2 size-3.5" />
                        Copy value
                      </ContextMenuItem>
                    ) : null}
                    {isSelected && segmentText !== undefined ? (
                      <ContextMenuItem onClick={() => copyToClipboard(segmentText, 'Value segment')}>
                        <Copy className="mr-2 size-3.5" />
                        Copy segment
                      </ContextMenuItem>
                    ) : null}
                  </ContextMenuContent>
                </ContextMenu>
              );
            })
          )}
        </div>
        {/* Scan paging: Next advances by opaque cursor; First restarts. Done is
            authoritative exhaustion — an empty page can still have more. (What) */}
        <div className="px-2 py-1.5 border-t border-border flex items-center justify-between gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={cursorStack.length <= 1}
            onClick={() => setCursorStack([undefined])}
            className="text-xs gap-1"
          >
            <RotateCcw className="size-3" />
            First
          </Button>
          <span className="text-xs text-muted-foreground">
            {keysResult?.done ? 'end of scan' : `page ${cursorStack.length}`}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={!keysResult || keysResult.done || !keysResult.nextCursor || isFetching}
            onClick={() => setCursorStack((s) => (keysResult?.nextCursor ? [...s, keysResult.nextCursor] : s))}
            className="text-xs gap-1"
          >
            Next
            <ChevronRight className="size-3" />
          </Button>
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

      {/* Key details panel — paged inspector */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedKey ? (
          <>
            <div className="px-3 py-2 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                {(() => {
                  const Icon = typeIcons[keyPage?.type ?? ''] || Box;
                  return <Icon className={`size-4 shrink-0 ${typeColors[keyPage?.type ?? ''] || ''}`} />;
                })()}
                <ContextMenu>
                  <ContextMenuTrigger className="min-w-0">
                    <span className="font-mono text-sm truncate" title={selectedKey}>
                      {selectedKey}
                    </span>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem onClick={() => copyToClipboard(selectedKey, 'Key')}>
                      <Copy className="mr-2 size-3.5" />
                      Copy key
                    </ContextMenuItem>
                    {copyValueText !== undefined ? (
                      <ContextMenuItem onClick={() => copyToClipboard(copyValueText, 'Value')}>
                        <Copy className="mr-2 size-3.5" />
                        Copy value
                      </ContextMenuItem>
                    ) : null}
                    {segmentText !== undefined ? (
                      <ContextMenuItem onClick={() => copyToClipboard(segmentText, 'Value segment')}>
                        <Copy className="mr-2 size-3.5" />
                        Copy segment
                      </ContextMenuItem>
                    ) : null}
                  </ContextMenuContent>
                </ContextMenu>
                {keyPage && (
                  <span className="text-xs uppercase bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                    {keyPage.type}
                  </span>
                )}
                {keyPage && !keyPage.complete && (
                  <span className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">partial</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {keyPage && keyPage.ttl > 0 && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="size-3" />
                    TTL: {keyPage.ttl}s
                  </span>
                )}
                <Button variant="ghost" size="icon-sm" onClick={() => setSelectedKey(null)}>
                  <X className="size-3.5" />
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0 p-3">
              {keyPageError ? (
                <div className="text-sm text-destructive space-y-2">
                  <p>{keyPageError instanceof Error ? keyPageError.message : 'Failed to load value'}</p>
                  <Button variant="outline" size="sm" onClick={() => setValueCursorStack([undefined])}>
                    Restart from beginning
                  </Button>
                </div>
              ) : keyPage ? (
                <PageValue page={keyPage} />
              ) : (
                <LoadingState compact />
              )}
            </div>
            {keyPage && (
              <div className="px-3 py-1.5 border-t border-border flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={valueCursorStack.length <= 1}
                  onClick={() => setValueCursorStack([undefined])}
                  className="text-xs gap-1"
                >
                  <RotateCcw className="size-3" />
                  First
                </Button>
                <span className="text-xs text-muted-foreground">
                  {fetchingPage ? 'loading…' : keyPage.hasMore ? `page ${valueCursorStack.length}` : 'end of value'}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!keyPage.hasMore || !keyPage.nextCursor || fetchingPage}
                  onClick={() => setValueCursorStack((s) => (keyPage.nextCursor ? [...s, keyPage.nextCursor] : s))}
                  className="text-xs gap-1"
                >
                  Next
                  <ChevronRight className="size-3" />
                </Button>
              </div>
            )}
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
