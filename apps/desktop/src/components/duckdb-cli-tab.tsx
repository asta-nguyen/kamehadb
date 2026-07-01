import type { WorkspaceTab } from '@/lib/types';
import { DatabaseShellTab } from '@/components/database-shell-tab';
import { startDuckdbCliSession } from '@/lib/duckdb-cli';

type DuckdbCliTabProps = {
  readonly active: boolean;
  readonly tab: Extract<WorkspaceTab, { readonly type: 'duckdb-cli' }>;
};

export function DuckdbCliTab({ active, tab }: DuckdbCliTabProps) {
  return (
    <DatabaseShellTab
      active={active}
      tab={tab}
      sessionKind="duckdbCli"
      inactiveMessage="Activate this tab to start the DuckDB CLI session."
      missingConnectionMessage="The DuckDB connection for this tab was not found."
      startSession={(nextTab, size) =>
        startDuckdbCliSession({
          connectionId: nextTab.connectionId,
          cols: size.cols,
          rows: size.rows,
        })
      }
    />
  );
}
