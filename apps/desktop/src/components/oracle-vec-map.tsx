import { useMemo } from 'react';
import type { WorkspaceTab } from '@/lib/types';
import { useOracleVecVectorsSample } from '@/hooks/use-oracle-vec';
import { openOracleVecSearchTab, updateTabOracleVecMapState } from '@/store';
import { VectorMap3D } from '@/components/vector-map-3d';

type OracleVecMapProps = {
  readonly tab: Extract<WorkspaceTab, { type: 'oracle-vec-map' }>;
  readonly connectionId: string;
};

export function OracleVecMap({ tab, connectionId }: OracleVecMapProps) {
  const { data, isLoading, error } = useOracleVecVectorsSample(connectionId, {
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
        openOracleVecSearchTab(connectionId, {
          table: tab.table,
          column: tab.column,
          mode: 'similar',
          vectorText: JSON.stringify(point.vector),
        })
      }
      onCameraChange={(camera) => updateTabOracleVecMapState(tab.id, { camera })}
    />
  );
}
