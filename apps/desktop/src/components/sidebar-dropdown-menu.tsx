import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ENGINE_TAB_ACTIONS, SQL_TAB_ACTIONS } from '@/lib/constants';
import { isTauriRuntime } from '@/lib/tauri';
import { supportsFileDatabaseMaintenance } from '@/lib/file-database-maintenance';
import { isSqlServerMaintenanceSupported } from '@/lib/sqlserver-maintenance';
import { KIND, type ConnectionProfile } from '@kamehadb/shared';
import {
  Download,
  MoreVertical,
  Pin,
  PinOff,
  Settings2,
  Sparkles,
  Terminal,
  Trash2,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import { SpinningRefresh, isSqlLike } from './sidebar.helpers';
import { setActiveConnection, togglePinnedConnection, openAiChatPanel, openPostgresPsqlTab } from '@/store';

function activate(connId: string, action: (id: string) => void) {
  setActiveConnection(connId);
  action(connId);
}

type MaintenanceAction = {
  readonly label: string;
  readonly icon: LucideIcon;
  readonly onSelect: () => void;
};

function getMaintenanceActions(
  conn: ConnectionProfile,
  callbacks: {
    readonly onBackup: () => void;
    readonly onRestore: () => void;
  },
): MaintenanceAction[] {
  if (!isTauriRuntime()) {
    return [];
  }

  const actions: MaintenanceAction[] = [];

  // Postgres shell — not in ENGINE_TAB_ACTIONS so add here
  if (conn.kind === KIND.POSTGRES) {
    actions.push({
      label: 'Open Shell',
      icon: Terminal,
      onSelect: () => {
        setActiveConnection(conn.id);
        openPostgresPsqlTab(conn.id);
      },
    });
  }

  if (conn.kind === KIND.POSTGRES || supportsFileDatabaseMaintenance(conn) || isSqlServerMaintenanceSupported(conn)) {
    actions.push(
      {
        label: 'Backup',
        icon: Download,
        onSelect: () => {
          setActiveConnection(conn.id);
          callbacks.onBackup();
        },
      },
      {
        label: 'Restore',
        icon: Upload,
        onSelect: () => {
          setActiveConnection(conn.id);
          callbacks.onRestore();
        },
      },
    );
  }

  return actions;
}

export function ConnectionDropdownMenu({
  conn,
  refreshConnection,
  pinned,
  onEdit,
  onDelete,
  onBackup,
  onRestore,
}: {
  conn: ConnectionProfile;
  refreshConnection: { mutate: (id: string) => void; isPending: boolean };
  pinned: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onBackup: () => void;
  onRestore: () => void;
}) {
  const maintenanceActions = getMaintenanceActions(conn, { onBackup, onRestore });

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

        {maintenanceActions.map((action) => (
          <DropdownMenuItem key={action.label} onClick={action.onSelect}>
            <action.icon className="mr-2 size-3.5" />
            {action.label}
          </DropdownMenuItem>
        ))}

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
