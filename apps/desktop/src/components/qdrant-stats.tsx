import { useQdrantStats } from '@/hooks/use-qdrant';
import { Spinner } from '@/components/ui/spinner';

interface QdrantStatsPanelProps {
  connectionId: number;
  collection: string;
}

export function QdrantStatsPanel({ connectionId, collection }: QdrantStatsPanelProps) {
  const { data: stats, isLoading, error } = useQdrantStats(connectionId, collection);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size="lg" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-destructive text-sm">
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
    <div className="p-6 h-full overflow-auto">
      <h2 className="mb-4 text-sm font-medium">Collection Stats: {collection}</h2>
      <div className="max-w-md border-border divide-border divide-y rounded-md border">
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
