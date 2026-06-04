import { useQdrantStats } from '@/hooks/use-qdrant';
import { Loader2 } from 'lucide-react';

interface QdrantStatsPanelProps {
  connectionId: string;
  collection: string;
}

export function QdrantStatsPanel({ connectionId, collection }: QdrantStatsPanelProps) {
  const { data: stats, isLoading, error } = useQdrantStats(connectionId, collection);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-destructive">
        {error instanceof Error ? error.message : 'Failed to load stats'}
      </div>
    );
  }

  const rows: [string, string | number | undefined][] = [
    ['Collection', stats?.name],
    ['Status', stats?.status],
    ['Points', stats?.pointsCount],
    ['Vectors', stats?.vectorsCount],
    ['Indexed Vectors', stats?.indexedVectorsCount],
    ['Segments', stats?.segmentsCount],
    ['Vector Size', stats?.vectorSize],
    ['Distance', stats?.distance],
  ];

  return (
    <div className="h-full overflow-auto p-6">
      <h2 className="text-sm font-medium mb-4">Collection Stats: {collection}</h2>
      <div className="border border-border rounded-md divide-y divide-border max-w-md">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between px-4 py-2.5 text-sm">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-mono">{value ?? '—'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
