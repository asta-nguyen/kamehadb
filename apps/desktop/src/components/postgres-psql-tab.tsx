import type { WorkspaceTab } from '@/lib/types';
import { DatabaseShellTab } from '@/components/database-shell-tab';
import { startPostgresPsqlSession } from '@/lib/postgres-psql';

type PostgresPsqlTabProps = {
  readonly active: boolean;
  readonly tab: Extract<WorkspaceTab, { readonly type: 'postgres-psql' }>;
};

export function PostgresPsqlTab({ active, tab }: PostgresPsqlTabProps) {
  return (
    <DatabaseShellTab
      active={active}
      connectionId={tab.connectionId}
      inactiveMessage="Activate this tab to start the shell session."
      missingConnectionMessage="The connection for this tab was not found."
      sessionKind="postgresPsql"
      startShellSession={startPostgresPsqlSession}
    />
  );
}
