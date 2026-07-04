import type { WorkspaceTab } from '@/lib/types';
import { usePostgresVectorSample } from '@/hooks/use-postgres-vector';
import { openPostgresVectorSearchTab, updateTabPostgresVectorMapState } from '@/store';
import { createVecMapComponent } from './create-vec-map';

type PostgresVectorMapTab = Extract<WorkspaceTab, { type: 'postgres-vector-map' }>;

export const PostgresVectorMap = createVecMapComponent<PostgresVectorMapTab>({
  useVectorsSample: usePostgresVectorSample,
  openSearchTab: openPostgresVectorSearchTab,
  updateMapState: updateTabPostgresVectorMapState,
  getSampleInput: (tab) => ({ schema: tab.schema, table: tab.table, column: tab.column, limit: 500 }),
  getHeader: (tab) => (
    <>
      <span className="font-mono">
        {tab.schema}.{tab.table}
      </span>
      <span className="text-muted-foreground">{tab.column}</span>
    </>
  ),
  getSearchInput: (tab, point) => ({
    schema: tab.schema,
    table: tab.table,
    column: tab.column,
    mode: 'similar' as const,
    vectorText: JSON.stringify(point.vector),
  }),
});
