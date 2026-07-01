import type { WorkspaceTab } from '@/lib/types';
import { DatabaseShellTab } from '@/components/database-shell-tab';
import { useConnections } from '@/hooks/use-connections';
import { startOracleSqlplusSession } from '@/lib/oracle-sqlplus';
import { useMemo } from 'react';

type OracleSqlplusTabProps = {
  readonly active: boolean;
  readonly tab: Extract<WorkspaceTab, { readonly type: 'oracle-sqlplus' }>;
};

export function OracleSqlplusTab({ active, tab }: OracleSqlplusTabProps) {
  const { data: connections } = useConnections();
  const connection = useMemo(
    () => connections?.find((item) => item.id === tab.connectionId) ?? null,
    [connections, tab.connectionId],
  );

  if (!connection) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
        The Oracle connection for this tab was not found.
      </div>
    );
  }

  return (
    <DatabaseShellTab
      active={active}
      tab={tab}
      sessionKind="oracleSqlplus"
      inactiveMessage="Activate this tab to start the sqlplus session."
      missingConnectionMessage="The Oracle connection for this tab was not found."
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
