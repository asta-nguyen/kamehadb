import type { WorkspaceTab } from '@/lib/types';
import { useSqliteVecVectorsSample } from '@/hooks/use-sqlite-vec';
import { openSqliteVecSearchTab, updateTabSqliteVecMapState } from '@/store';
import { createVecMapComponent } from './create-vec-map';

type SqliteVecMapTab = Extract<WorkspaceTab, { type: 'sqlite-vec-map' }>;

export const SqliteVecMap = createVecMapComponent<SqliteVecMapTab>({
  useVectorsSample: useSqliteVecVectorsSample,
  openSearchTab: openSqliteVecSearchTab,
  updateMapState: updateTabSqliteVecMapState,
  getSampleInput: (tab) => ({ table: tab.table, column: tab.column, limit: 500 }),
  getHeader: (tab) => (
    <>
      <span className="font-mono">{tab.table}</span>
      <span className="text-muted-foreground">{tab.column}</span>
    </>
  ),
  getSearchInput: (tab, point) => ({
    table: tab.table,
    column: tab.column,
    mode: 'similar' as const,
    vectorText: JSON.stringify(point.vector),
  }),
});
