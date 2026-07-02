import { useMemo } from 'react';
import type { WorkspaceTab } from '@/lib/types';
import { useClickhouseVecVectorsSample } from '@/hooks/use-clickhouse-vec';
import { openClickhouseVecSearchTab, updateTabClickhouseVecMapState } from '@/store';
import { VectorMap3D } from '@/components/vector-map-3d';

type ClickhouseVecMapProps = {
  readonly tab: Extract<WorkspaceTab, { type: 'clickhouse-vec-map' }>;
  readonly connectionId: string;
};

export function ClickhouseVecMap({ tab, connectionId }: ClickhouseVecMapProps) {
  const { data, isLoading, error } = useClickhouseVecVectorsSample(connectionId, {
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
        openClickhouseVecSearchTab(connectionId, {
          table: tab.table,
          column: tab.column,
          mode: 'similar',
          vectorText: JSON.stringify(point.vector),
        })
      }
      onCameraChange={(camera) => updateTabClickhouseVecMapState(tab.id, { camera })}
    />
  );
}
