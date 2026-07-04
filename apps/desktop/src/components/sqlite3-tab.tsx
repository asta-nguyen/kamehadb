import type { WorkspaceTab } from '@/lib/types';
import { DatabaseShellTab } from '@/components/database-shell-tab';
import { startSqlite3Session } from '@/lib/terminal-session';

const SQLITE3_TOOL_NAME = 'sqlite3';
const SQLITE3_TOOL_DISPLAY_NAME = 'sqlite3';

type Sqlite3TabProps = {
  readonly active: boolean;
  readonly tab: Extract<WorkspaceTab, { readonly type: 'sqlite3' }>;
};

export function Sqlite3Tab({ active, tab }: Sqlite3TabProps) {
  return (
    <DatabaseShellTab
      active={active}
      tab={tab}
      sessionKind="sqlite3"
      inactiveMessage="Activate this tab to start the shell session."
      missingConnectionMessage="The connection for this tab was not found."
      toolName={SQLITE3_TOOL_NAME}
      toolDisplayName={SQLITE3_TOOL_DISPLAY_NAME}
      startSession={(nextTab, size) =>
        startSqlite3Session({
          connectionId: nextTab.connectionId,
          cols: size.cols,
          rows: size.rows,
        })
      }
    />
  );
}
