import { useMemo, useState } from 'react';
import { useQdrantCollections } from '@/hooks/use-qdrant';
import { Button } from '@/components/ui/button';
import { openQdrantTab } from '@/store';
import { AlertCircle, Search } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { Input } from '@/components/ui/input';

interface QdrantExplorerProps {
  connectionId: number;
}

export function QdrantExplorer({ connectionId }: QdrantExplorerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const { data: collections, isLoading, isError, error } = useQdrantCollections(connectionId);

  const filtered = useMemo(() => {
    if (!collections) return [];
    if (!searchQuery.trim()) return collections;
    const query = searchQuery.toLowerCase();
    return collections.filter((c) => c.name.toLowerCase().includes(query));
  }, [collections, searchQuery]);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between px-2 py-1 text-muted-foreground text-xs font-medium tracking-wider uppercase">
        <span>Collections</span>
        <span className="font-normal normal-case">{collections?.length ?? 0}</span>
      </div>
      <div className="px-2 py-1">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground pointer-events-none" />
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter..."
            className="pl-6 pr-2 h-6 text-xs"
          />
        </div>
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <Spinner size="md" />
        </div>
      ) : isError ? (
        <div className="flex items-start px-2 py-1 text-destructive text-xs gap-1.5">
          <AlertCircle className="mt-0.5 shrink-0 size-3" />
          <span className="break-all">{error instanceof Error ? error.message : 'Failed to load collections'}</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="px-2 py-1 text-muted-foreground text-xs italic">
          {collections?.length === 0 ? 'No collections' : 'No matches'}
        </div>
      ) : (
        filtered.map((col) => (
          <div
            key={col.name}
            className="flex items-center px-2 py-1 w-full text-xs rounded-md gap-1.5 grow transition-colors hover:bg-muted"
          >
            <Button
              variant="ghost"
              size="sm"
              onClick={() => openQdrantTab(connectionId, col.name)}
              className="flex flex-1 items-center min-w-0 text-left font-normal gap-1.5"
              title={`${col.name} · ${col.pointsCount} points`}
            >
              <Search className="text-muted-foreground shrink-0 size-3" />
              <span className="truncate">{col.name}</span>
              <span className="ml-auto text-muted-foreground/70 text-xs">{col.pointsCount}</span>
            </Button>
          </div>
        ))
      )}
    </div>
  );
}
