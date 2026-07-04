import { useMemo } from 'react';
import type { WorkspaceTab } from '@/lib/types';
import { useDuckdbVecVectorsSample } from '@/hooks/use-duckdb-vec';
import { openDuckdbVecSearchTab, updateTabDuckdbVecMapState } from '@/store';
import { VectorMap3D } from '@/components/vector-map-3d';

type DuckdbVecMapProps = {
  readonly tab: Extract<WorkspaceTab, { type: 'duckdb-vec-map' }>;
  readonly connectionId: string;
};

export function DuckdbVecMap({ tab, connectionId }: DuckdbVecMapProps) {
  const { data, isLoading, error } = useDuckdbVecVectorsSample(connectionId, {
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
        openDuckdbVecSearchTab(connectionId, {
          table: tab.table,
          column: tab.column,
          mode: 'similar',
          vectorText: JSON.stringify(point.vector),
        })
      }
      onCameraChange={(camera) => updateTabDuckdbVecMapState(tab.id, { camera })}
    />
  );
}
