import type { WorkspaceTab } from '@/lib/types';
import { DatabaseShellTab } from '@/components/database-shell-tab';
import { startMysqlShellSession } from '@/lib/mysql-shell';
import { KIND } from '@kamehadb/shared';

type MysqlShellTabProps = {
  readonly active: boolean;
  readonly tab: Extract<WorkspaceTab, { readonly type: 'mysql-shell' }>;
};

// MariaDB connections prefer the `mariadb` client; MySQL connections use `mysql`.
// This mirrors `resolve_mysql_program`'s primary candidate so the reminder
// targets the binary that would actually be spawned.
const MYSQL_SHELL_TOOL_FOR_KIND = (kind: string): string | null => {
  if (kind === KIND.MARIADB) return 'mariadb';
  if (kind === KIND.MYSQL) return 'mysql';
  return null;
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
      toolForKind={MYSQL_SHELL_TOOL_FOR_KIND}
    />
  );
}
