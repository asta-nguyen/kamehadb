import { useMemo } from 'react';
import type { WorkspaceTab } from '@/lib/types';
import { usePostgresVectorSample } from '@/hooks/use-postgres-vector';
import { openPostgresVectorSearchTab, updateTabPostgresVectorMapState } from '@/store';
import { VectorMap3D } from '@/components/vector-map-3d';

type PostgresVectorMapProps = {
  readonly tab: Extract<WorkspaceTab, { type: 'postgres-vector-map' }>;
  readonly connectionId: number;
};

export function PostgresVectorMap({ tab, connectionId }: PostgresVectorMapProps) {
  const { data, isLoading, error } = usePostgresVectorSample(connectionId, {
    schema: tab.schema,
    table: tab.table,
    column: tab.column,
    limit: 500,
  });

  const points = useMemo(() => (data?.points ?? []).filter((point) => point.vector.length > 0), [data]);

  return (
    <VectorMap3D
      points={points}
      isLoading={isLoading}
      error={error}
      header={
        <>
          <span className="font-mono">
            {tab.schema}.{tab.table}
          </span>
          <span className="text-muted-foreground">{tab.column}</span>
        </>
      }
      initialCamera={tab.camera}
      onPointClick={(point) =>
        openPostgresVectorSearchTab(connectionId, {
          schema: tab.schema,
          table: tab.table,
          column: tab.column,
          mode: 'similar',
          vectorText: JSON.stringify(point.vector),
        })
      }
      onCameraChange={(camera) => updateTabPostgresVectorMapState(tab.id, { camera })}
    />
  );
}
