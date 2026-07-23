import { useMemo } from 'react';
import { useMongoCollectionStats } from '@/hooks/use-mongo';
import { Spinner } from '@/components/ui/spinner';

interface MongoStatsPanelProps {
  connectionId: number;
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
      <div className="border rounded-md">
        <div className="px-3 py-2 bg-muted/50 border-b font-medium text-sm">Overview</div>
        <div className="p-3">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground text-xs">Document Count</div>
              <div className="font-mono text-lg">{statsData.documentCount.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Indexes</div>
              <div className="font-mono text-lg">{indexes.length}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="border rounded-md">
        <div className="px-3 py-2 bg-muted/50 border-b font-medium text-sm">Indexes</div>
        <div className="divide-y">
          {indexes.map((idx) => (
            <div key={idx.name} className="px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm">{idx.name}</span>
                {idx.unique && <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">Unique</span>}
              </div>
              <div className="text-xs text-muted-foreground font-mono mt-1">{JSON.stringify(idx.key)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
