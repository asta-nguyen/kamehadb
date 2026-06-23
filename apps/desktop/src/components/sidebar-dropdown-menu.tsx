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
import type { ConnectionProfile } from '@kamehadb/shared';
import { Download, MoreVertical, Pin, PinOff, Settings2, Sparkles, Terminal, Trash2, Upload } from 'lucide-react';

function activate(connId: string, action: (id: string) => void) {
  setActiveConnection(connId);
  action(connId);
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
}: {
  conn: ConnectionProfile;
  refreshConnection: { mutate: (id: string) => void; isPending: boolean };
  pinned: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onOpenPsql: () => void;
  onBackup: () => void;
  onRestore: () => void;
}) {
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

        {conn.kind === 'postgres' && isTauriRuntime() && (
          <>
            <DropdownMenuItem
              onClick={() => {
                setActiveConnection(conn.id);
                onOpenPsql();
              }}
            >
              <Terminal className="mr-2 size-3.5" />
              Open PSQL
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                setActiveConnection(conn.id);
                onBackup();
              }}
            >
              <Download className="mr-2 size-3.5" />
              Backup
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                setActiveConnection(conn.id);
                onRestore();
              }}
            >
              <Upload className="mr-2 size-3.5" />
              Restore
            </DropdownMenuItem>
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
