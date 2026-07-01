import type { WorkspaceTab } from '@/lib/types';
import { DatabaseShellTab } from '@/components/database-shell-tab';
import { startClickhouseClientSession } from '@/lib/clickhouse-client';

type ClickhouseClientTabProps = {
  readonly active: boolean;
  readonly tab: Extract<WorkspaceTab, { readonly type: 'clickhouse-client' }>;
};

export function ClickhouseClientTab({ active, tab }: ClickhouseClientTabProps) {
  return (
    <DatabaseShellTab
      active={active}
      tab={tab}
      sessionKind="clickhouseClient"
      inactiveMessage="Activate this tab to start the clickhouse-client session."
      missingConnectionMessage="The ClickHouse connection for this tab was not found."
      startSession={(nextTab, size) =>
        startClickhouseClientSession({
          connectionId: nextTab.connectionId,
          cols: size.cols,
          rows: size.rows,
        })
      }
    />
  );
}
