import type { WorkspaceTab } from '@/lib/types';
import { DatabaseShellTab } from '@/components/database-shell-tab';
import { startSqlcmdSession } from '@/lib/terminal-session';

const SQLCMD_TOOL_NAME = 'sqlcmd';
const SQLCMD_TOOL_DISPLAY_NAME = 'sqlcmd';

type SqlcmdTabProps = {
  readonly active: boolean;
  readonly tab: Extract<WorkspaceTab, { readonly type: 'sqlcmd' }>;
};

export function SqlcmdTab({ active, tab }: SqlcmdTabProps) {
  return (
    <DatabaseShellTab
      active={active}
      tab={tab}
      sessionKind="sqlcmd"
      inactiveMessage="Activate this tab to start the shell session."
      missingConnectionMessage="The connection for this tab was not found."
      toolName={SQLCMD_TOOL_NAME}
      toolDisplayName={SQLCMD_TOOL_DISPLAY_NAME}
      startSession={(nextTab, size) =>
        startSqlcmdSession({
          connectionId: nextTab.connectionId,
          cols: size.cols,
          rows: size.rows,
        })
      }
    />
  );
}
