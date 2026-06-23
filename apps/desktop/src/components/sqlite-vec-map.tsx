import { useMemo } from 'react';
import type { WorkspaceTab } from '@/lib/types';
import { useSqliteVecVectorsSample } from '@/hooks/use-sqlite-vec';
import { openSqliteVecSearchTab, updateTabSqliteVecMapState } from '@/store';
import { VectorMap3D } from '@/components/vector-map-3d';

type SqliteVecMapProps = {
  readonly tab: Extract<WorkspaceTab, { type: 'sqlite-vec-map' }>;
  readonly connectionId: string;
};

export function SqliteVecMap({ tab, connectionId }: SqliteVecMapProps) {
  const { data, isLoading, error } = useSqliteVecVectorsSample(connectionId, {
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
          <span className="font-mono">{tab.table}</span>
          <span className="text-muted-foreground">{tab.column}</span>
        </>
      }
      initialCamera={tab.camera}
      onPointClick={(point) =>
        openSqliteVecSearchTab(connectionId, {
          table: tab.table,
          column: tab.column,
          mode: 'similar',
          vectorText: JSON.stringify(point.vector),
        })
      }
      onCameraChange={(camera) => updateTabSqliteVecMapState(tab.id, { camera })}
    />
  );
}
