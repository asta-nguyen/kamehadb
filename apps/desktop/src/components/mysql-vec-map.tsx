import { useMemo } from 'react';
import type { WorkspaceTab } from '@/lib/types';
import { useMysqlVecVectorsSample } from '@/hooks/use-mysql-vector';
import { openMysqlVectorSearchTab, updateTabMysqlVecMapState } from '@/store';
import { VectorMap3D } from '@/components/vector-map-3d';

type MysqlVecMapProps = {
  readonly tab: Extract<WorkspaceTab, { type: 'mysql-vec-map' }>;
  readonly connectionId: string;
};

export function MysqlVecMap({ tab, connectionId }: MysqlVecMapProps) {
  const { data, isLoading, error } = useMysqlVecVectorsSample(connectionId, {
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
        openMysqlVectorSearchTab(connectionId, {
          table: tab.table,
          column: tab.column,
          mode: 'similar',
          vectorText: JSON.stringify(point.vector),
        })
      }
      onCameraChange={(camera) => updateTabMysqlVecMapState(tab.id, { camera })}
    />
  );
}
