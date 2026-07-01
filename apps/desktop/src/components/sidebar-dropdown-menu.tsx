import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { isTauriRuntime } from '@/lib/tauri';
import { SpinningRefresh, isSqlLike } from './sidebar.helpers';
import { setActiveConnection, togglePinnedConnection, openAiChatPanel } from '@/store';
import { SQL_TAB_ACTIONS, ENGINE_TAB_ACTIONS } from '@/lib/constants';
import { KIND, type ConnectionProfile } from '@kamehadb/shared';
import { Download, MoreVertical, Pin, PinOff, Settings2, Sparkles, Terminal, Trash2, Upload } from 'lucide-react';

function activate(connId: string, action: (id: string) => void) {
  setActiveConnection(connId);
  action(connId);
}

type MaintenanceAction = {
  readonly icon: typeof Terminal;
  readonly label: string;
  readonly onSelect: () => void;
};

function getMaintenanceActions(args: {
  readonly kind: ConnectionProfile['kind'];
  readonly onBackup: () => void;
  readonly onMysqlBackup: () => void;
  readonly onMysqlRestore: () => void;
  readonly onOpenMysqlShell: () => void;
  readonly onOpenPsql: () => void;
  readonly onRestore: () => void;
}): readonly MaintenanceAction[] {
  if (args.kind === KIND.POSTGRES) {
    return [
      { icon: Terminal, label: 'Open Shell', onSelect: args.onOpenPsql },
      { icon: Download, label: 'Backup', onSelect: args.onBackup },
      { icon: Upload, label: 'Restore', onSelect: args.onRestore },
    ];
  }

  if (args.kind === KIND.MYSQL || args.kind === KIND.MARIADB) {
    return [
      { icon: Terminal, label: 'Open Shell', onSelect: args.onOpenMysqlShell },
      { icon: Download, label: 'Backup', onSelect: args.onMysqlBackup },
      { icon: Upload, label: 'Restore', onSelect: args.onMysqlRestore },
    ];
  }

  return [];
}

export function ConnectionDropdownMenu({
  conn,
  refreshConnection,
  pinned,
  onEdit,
  onDelete,
  onOpenPsql,
  onBackup,
  onRestore,
  onOpenMysqlShell,
  onMysqlBackup,
  onMysqlRestore,
}: {
  conn: ConnectionProfile;
  refreshConnection: { mutate: (id: string) => void; isPending: boolean };
  pinned: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onOpenPsql: () => void;
  onBackup: () => void;
  onRestore: () => void;
  onOpenMysqlShell: () => void;
  onMysqlBackup: () => void;
  onMysqlRestore: () => void;
}) {
  const maintenanceActions = getMaintenanceActions({
    kind: conn.kind,
    onBackup,
    onMysqlBackup,
    onMysqlRestore,
    onOpenMysqlShell,
    onOpenPsql,
    onRestore,
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center justify-center rounded-md opacity-0 size-6 transition-colors hover:bg-muted/50 group-hover:opacity-100"
      >
        <MoreVertical className="text-muted-foreground/60 size-3.5 hover:text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={4} className="min-w-max whitespace-nowrap">
        <DropdownMenuItem onClick={() => refreshConnection.mutate(conn.id)} disabled={refreshConnection.isPending}>
          <SpinningRefresh spinning={refreshConnection.isPending} className="mr-2" />
          Reload
        </DropdownMenuItem>

        <DropdownMenuItem onClick={() => togglePinnedConnection(conn.id)}>
          {pinned ? <PinOff className="mr-2 size-3.5" /> : <Pin className="mr-2 size-3.5" />}
          {pinned ? 'Unpin' : 'Pin to top'}
        </DropdownMenuItem>

        <DropdownMenuItem onClick={() => openAiChatPanel(conn.id)}>
          <Sparkles className="mr-2 size-3.5" />
          AI Chat
        </DropdownMenuItem>

        {isTauriRuntime() && maintenanceActions.length > 0 && (
          <>
            {maintenanceActions.map((action) => (
              <DropdownMenuItem
                key={action.label}
                onClick={() => {
                  setActiveConnection(conn.id);
                  action.onSelect();
                }}
              >
                <action.icon className="mr-2 size-3.5" />
                {action.label}
              </DropdownMenuItem>
            ))}
          </>
        )}

        {isSqlLike(conn.kind) &&
          SQL_TAB_ACTIONS.map((action) => (
            <DropdownMenuItem key={action.label} onClick={() => activate(conn.id, action.open)}>
              <action.icon className="mr-2 size-3.5" />
              {action.label}
            </DropdownMenuItem>
          ))}

        {ENGINE_TAB_ACTIONS[conn.kind]?.map((action) => (
          <DropdownMenuItem key={action.label} onClick={() => activate(conn.id, action.open)}>
            <action.icon className="mr-2 size-3.5" />
            {action.label}
          </DropdownMenuItem>
        ))}

        <DropdownMenuItem onClick={onEdit}>
          <Settings2 className="mr-2 size-3.5" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={onDelete}>
          <Trash2 className="mr-2 size-3.5" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
