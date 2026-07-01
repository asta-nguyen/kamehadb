import type { WorkspaceTab } from '@/lib/types';
import { DatabaseShellTab } from '@/components/database-shell-tab';
import { startMysqlShellSession } from '@/lib/mysql-shell';

type MysqlShellTabProps = {
  readonly active: boolean;
  readonly tab: Extract<WorkspaceTab, { readonly type: 'mysql-shell' }>;
};

export function MysqlShellTab({ active, tab }: MysqlShellTabProps) {
  return (
    <DatabaseShellTab
      active={active}
      connectionId={tab.connectionId}
      inactiveMessage="Activate this tab to start the shell session."
      missingConnectionMessage="The connection for this tab was not found."
      sessionKind="mysqlShell"
      startShellSession={startMysqlShellSession}
    />
  );
}
