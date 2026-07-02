import type { WorkspaceTab } from '@/lib/types';
import { DatabaseShellTab } from '@/components/database-shell-tab';
import { startOracleSqlplusSession } from '@/lib/oracle-sqlplus';

type OracleSqlplusTabProps = {
  readonly active: boolean;
  readonly tab: Extract<WorkspaceTab, { readonly type: 'oracle-sqlplus' }>;
};

export function OracleSqlplusTab({ active, tab }: OracleSqlplusTabProps) {
  return (
    <DatabaseShellTab
      active={active}
      tab={tab}
      sessionKind="oracleSqlplus"
      inactiveMessage="Activate this tab to start the shell session."
      missingConnectionMessage="The connection for this tab was not found."
      startSession={(nextTab, size) =>
        startOracleSqlplusSession({
          connectionId: nextTab.connectionId,
          cols: size.cols,
          rows: size.rows,
        })
      }
    />
  );
}
