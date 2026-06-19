import { useMemo } from 'react';
import { useMongoCollectionStats } from '@/hooks/use-mongo';
import { Spinner } from '@/components/ui/spinner';

interface MongoStatsPanelProps {
  connectionId: string;
  database: string;
  collection: string;
}

export function MongoStatsPanel({ connectionId, database, collection }: MongoStatsPanelProps) {
  const { data: statsData, isLoading: statsLoading } = useMongoCollectionStats(connectionId, database, collection);

  const indexes = useMemo(() => statsData?.indexes ?? [], [statsData]);

  if (statsLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Spinner size="lg" />
      </div>
    );
  }
  if (!statsData) {
    return <div className="flex items-center justify-center h-32 text-muted-foreground">No stats available</div>;
  }
  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <div className="px-3 py-2 text-sm font-medium bg-muted/50 border-b">Overview</div>
        <div className="p-3">
          <div className="grid grid-cols-2 text-sm gap-4">
            <div>
              <div className="text-muted-foreground text-xs">Document Count</div>
              <div className="text-lg font-mono">{statsData.documentCount.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Indexes</div>
              <div className="text-lg font-mono">{indexes.length}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-md border">
        <div className="px-3 py-2 text-sm font-medium bg-muted/50 border-b">Indexes</div>
        <div className="divide-y">
          {indexes.map((idx) => (
            <div key={idx.name} className="px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono">{idx.name}</span>
                {idx.unique && (
                  <span className="px-1.5 py-0.5 text-xs text-primary bg-primary/10 rounded-sm">Unique</span>
                )}
              </div>
              <div className="mt-1 text-xs text-muted-foreground font-mono">{JSON.stringify(idx.key)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
