import { useState, useMemo, type ReactNode } from 'react';
import { useRedisKeys, useRedisKeyDetails, useRedisStats } from '@/hooks/use-redis';
import { Search, Box, Hash, List, Type, Clock, X, BarChart3, Cpu, HardDrive, Users } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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
      return <span className="px-2 py-1 text-xs font-mono bg-muted rounded-sm">{String(value)}</span>;
    case 'list':
    case 'set':
    case 'zset':
      if (Array.isArray(value)) {
        return (
          <div className="space-y-0.5">
            {value.slice(0, 20).map((item, i) => (
              <div key={`${item}-${i}`} className="flex items-center gap-2">
                <span className="w-6 text-xs text-muted-foreground text-right">{i}</span>
                <code className="px-2 py-0.5 text-xs bg-muted rounded-sm">{String(item)}</code>
              </div>
            ))}
            {value.length > 20 && (
              <div className="pl-8 text-xs text-muted-foreground">... and {value.length - 20} more</div>
            )}
          </div>
        );
      }
      break;
    case 'hash':
      if (typeof value === 'object' && value !== null) {
        return (
          <div className="space-y-0.5">
            {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
              <div key={k} className="flex items-center gap-2">
                <code className="px-2 py-0.5 text-xs text-primary bg-primary/10 rounded-sm">{k}</code>
                <span className="text-muted-foreground">:</span>
                <code className="px-2 py-0.5 text-xs bg-muted rounded-sm">{String(v)}</code>
              </div>
            ))}
          </div>
        );
      }
      break;
  }
  return <code className="px-2 py-1 text-xs bg-muted rounded-sm">{JSON.stringify(value)}</code>;
}

interface RedisExplorerProps {
  connectionId: string;
}

export function RedisExplorer({ connectionId }: RedisExplorerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [showStats, setShowStats] = useState(false);

  const { data: keysResult, isLoading: loadingKeys } = useRedisKeys(connectionId, searchQuery || '*');
  const { data: stats, isLoading: loadingStats, error: statsError } = useRedisStats(connectionId, showStats);

  const filteredKeys = useMemo(() => {
    if (!keysResult?.keys) return [];
    if (!searchQuery.trim()) return keysResult.keys;
    const query = searchQuery.toLowerCase();
    return keysResult.keys.filter((k) => k.key.toLowerCase().includes(query));
  }, [keysResult?.keys, searchQuery]);

  const { data: keyDetails } = useRedisKeyDetails(selectedKey ? connectionId : null, selectedKey);

  const handleKeyClick = (key: string) => {
    setSelectedKey(key === selectedKey ? null : key);
  };

  return (
    <div className="flex h-full">
      {/* Key list */}
      <div className="flex flex-col w-48 border-r border-border">
        <div className="px-2 py-1.5 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 size-3 text-muted-foreground -translate-y-1/2" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter keys..."
              className="pl-6 pr-2 h-6 text-xs"
            />
          </div>
        </div>
        <div className="flex-1 p-1.5 min-h-0 overflow-y-auto space-y-0.5">
          {loadingKeys ? (
            <div className="flex items-center justify-center py-4">
              <Spinner size="md" />
            </div>
          ) : filteredKeys.length === 0 ? (
            <div className="px-2 py-4 text-xs text-muted-foreground text-center">
              {keysResult?.keys?.length === 0 ? 'No keys found' : 'No matches'}
            </div>
          ) : (
            filteredKeys.map((entry) => {
              const Icon = typeIcons[entry.type] || Box;
              const isSelected = selectedKey === entry.key;
              return (
                <Button
                  key={entry.key}
                  variant="ghost"
                  size="sm"
                  onClick={() => handleKeyClick(entry.key)}
                  className={`w-full font-normal ${isSelected ? 'bg-primary/10 text-primary' : 'hover:bg-muted'}`}
                  title={`${entry.key} (${entry.type})`}
                >
                  <Icon className={`size-3 shrink-0 ${typeColors[entry.type] || ''}`} />
                  <span className="flex-1 text-left truncate">{entry.key}</span>
                  <span className="ml-auto text-xs text-muted-foreground/70 uppercase">{entry.type}</span>
                </Button>
              );
            })
          )}
        </div>
        <div className="flex items-center justify-between px-2 py-1 border-t border-border">
          <span className="text-xs text-muted-foreground">{filteredKeys.length} keys</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowStats(!showStats)}
            className={showStats ? 'text-primary' : 'text-muted-foreground'}
            title="Show stats"
          >
            <BarChart3 className="size-3" />
          </Button>
        </div>
        {showStats && (
          <div className="px-3 py-2 bg-muted/30 border-t border-border">
            {loadingStats ? (
              <Spinner size="md" className="mx-auto" />
            ) : statsError ? (
              <div className="text-xs text-destructive">
                Error: {statsError instanceof Error ? statsError.message : 'Failed to load stats'}
              </div>
            ) : stats ? (
              <div className="text-xs space-y-1.5">
                <div className="flex items-center text-muted-foreground gap-2">
                  <Cpu className="size-3" />
                  <span>{stats.version}</span>
                </div>
                <div className="flex items-center text-muted-foreground gap-2">
                  <HardDrive className="size-3" />
                  <span>{stats.totalKeys} keys</span>
                </div>
                <div className="flex items-center text-muted-foreground gap-2">
                  <Users className="size-3" />
                  <span>{stats.connectedClients} clients</span>
                </div>
                <div className="flex items-center text-muted-foreground gap-2">
                  <span>Memory:</span>
                  <span>{Math.round(stats.usedMemory / 1024 / 1024)} MB</span>
                </div>
                <div className="flex items-center text-muted-foreground gap-2">
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
      <div className="flex flex-1 flex-col min-w-0">
        {selectedKey && keyDetails ? (
          <>
            <div className="flex items-center justify-between px-3 py-2 border-b border-border">
              <div className="flex items-center min-w-0 gap-2">
                {(() => {
                  const Icon = typeIcons[keyDetails.type] || Box;
                  return <Icon className={`size-4 shrink-0 ${typeColors[keyDetails.type] || ''}`} />;
                })()}
                <span className="text-sm font-mono truncate" title={keyDetails.key}>
                  {keyDetails.key}
                </span>
                <span className="px-1.5 py-0.5 text-xs text-muted-foreground bg-muted rounded-sm uppercase">
                  {keyDetails.type}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {keyDetails.ttl > 0 && (
                  <span className="flex items-center text-xs text-muted-foreground gap-1">
                    <Clock className="size-3" />
                    TTL: {keyDetails.ttl}s
                  </span>
                )}
                <Button variant="ghost" size="icon-sm" onClick={() => setSelectedKey(null)}>
                  <X className="size-3.5" />
                </Button>
              </div>
            </div>
            <div className="flex-1 p-3 min-h-0 overflow-y-auto">
              <div className="text-sm font-mono whitespace-pre-wrap break-all">
                {formatValue(keyDetails.value, keyDetails.type)}
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
            Select a key to view details
          </div>
        )}
      </div>
    </div>
  );
}
