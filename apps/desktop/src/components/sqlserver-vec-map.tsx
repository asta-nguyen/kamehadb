import type { WorkspaceTab } from '@/lib/types';
import { useSqlServerVecVectorsSample } from '@/hooks/use-sqlserver-vec';
import { openSqlServerVecSearchTab, updateTabSqlServerVecMapState } from '@/store';
import { createVecMapComponent } from './create-vec-map';

type SqlServerVecMapTab = Extract<WorkspaceTab, { type: 'sqlserver-vec-map' }>;

export const SqlServerVecMap = createVecMapComponent<SqlServerVecMapTab>({
  useVectorsSample: useSqlServerVecVectorsSample,
  openSearchTab: openSqlServerVecSearchTab,
  updateMapState: updateTabSqlServerVecMapState,
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
