import { useMemo, useState } from 'react';
import { useQdrantCollections } from '@/hooks/use-qdrant';
import { Button } from '@/components/ui/button';
import { openQdrantTab } from '@/store';
import { Input } from '@/components/ui/input';
import { Boxes, Loader2, Search } from 'lucide-react';

interface QdrantExplorerProps {
  connectionId: string;
}

export function QdrantExplorer({ connectionId }: QdrantExplorerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const { data: collections, isLoading } = useQdrantCollections(connectionId);

  const filtered = useMemo(() => {
    if (!collections) return [];
    if (!searchQuery.trim()) return collections;
    const query = searchQuery.toLowerCase();
    return collections.filter((c) => c.name.toLowerCase().includes(query));
  }, [collections, searchQuery]);

  return (
    <div className="space-y-1">
      <div className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center justify-between">
        <span>Collections</span>
        <span className="normal-case font-normal">{collections?.length ?? 0}</span>
      </div>
      <div className="px-2 py-1">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter..."
            className="w-full h-6 pl-6 pr-2 text-xs bg-background border rounded focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="px-2 py-1 text-xs text-muted-foreground italic">
          {collections?.length === 0 ? 'No collections' : 'No matches'}
        </div>
      ) : (
        filtered.map((col) => (
          <div
            key={col.name}
            className="group w-full flex items-center gap-1.5 px-2 py-1 text-xs hover:bg-muted rounded-md transition-colors"
          >
            <Button
              variant="ghost"
              size="sm"
              onClick={() => openQdrantTab(connectionId, col.name)}
              className="flex items-center gap-1.5 min-w-0 flex-1 text-left font-normal"
              title={`${col.name} · ${col.pointsCount} points`}
            >
              <Boxes className="size-3 shrink-0 text-muted-foreground" />
              <span className="truncate">{col.name}</span>
              <span className="ml-auto text-xs text-muted-foreground/70">{col.pointsCount}</span>
            </Button>
          </div>
        ))
      )}
    </div>
  );
}
