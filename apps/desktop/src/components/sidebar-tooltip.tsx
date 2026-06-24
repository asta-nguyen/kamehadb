import { TooltipContent } from '@/components/ui/tooltip';
import type { ConnectionProfile } from '@kamehadb/shared';
import { getIndicatorColor, isSqlLike } from './sidebar.helpers';
import type { ConnectionStatus } from './sidebar.helpers';
import { SQL_TAB_ACTIONS, ENGINE_TAB_ACTIONS } from '@/lib/constants';
import { setActiveConnection, togglePinnedConnection, openAiChatPanel } from '@/store';
import {
  Pin,
  PinOff,
  Sparkles,
  RefreshCw,
  Settings2,
  Trash2,
  Download,
  Upload,
  Terminal,
  type LucideIcon,
} from 'lucide-react';

type Action = { label: string; icon: LucideIcon; onClick: () => void; destructive?: boolean };

function ActionRow({ a }: { a: Action }) {
  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        a.onClick();
      }}
      className={`flex items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-[11px] leading-none transition-all w-full text-left ${
        a.destructive ? 'text-destructive hover:bg-destructive/10' : 'text-muted-foreground hover:bg-accent'
      }`}
    >
      <a.icon className="size-4 shrink-0 opacity-60" />
      {a.label}
    </button>
  );
}

export function ConnectionTooltip({
  conn,
  status,
  latency,
  pinned,
  onRefresh,
  refreshPending,
  onEdit,
  onDelete,
  onOpenPsql,
  onBackup,
  onRestore,
}: {
  conn: ConnectionProfile;
  status: ConnectionStatus;
  latency?: number;
  pinned: boolean;
  onRefresh: () => void;
  refreshPending: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onOpenPsql?: () => void;
  onBackup?: () => void;
  onRestore?: () => void;
}) {
  const color = getIndicatorColor(conn, status);

  const openActions: Action[] = [];
  if (isSqlLike(conn.kind)) {
    for (const a of SQL_TAB_ACTIONS) {
      openActions.push({
        label: a.label,
        icon: a.icon,
        onClick: () => {
          setActiveConnection(conn.id);
          a.open(conn.id);
        },
      });
    }
  }
  if (ENGINE_TAB_ACTIONS[conn.kind]) {
    for (const a of ENGINE_TAB_ACTIONS[conn.kind]!) {
      openActions.push({
        label: a.label,
        icon: a.icon,
        onClick: () => {
          setActiveConnection(conn.id);
          a.open(conn.id);
        },
      });
    }
  }

  const toolActions: Action[] = [];
  if (onOpenPsql) toolActions.push({ label: 'Open PSQL', icon: Terminal, onClick: onOpenPsql });
  if (onBackup) toolActions.push({ label: 'Backup', icon: Download, onClick: onBackup });
  if (onRestore) toolActions.push({ label: 'Restore', icon: Upload, onClick: onRestore });

  const manageActions: Action[] = [
    {
      label: pinned ? 'Unpin' : 'Pin to top',
      icon: pinned ? PinOff : Pin,
      onClick: () => togglePinnedConnection(conn.id),
    },
    { label: 'AI Chat', icon: Sparkles, onClick: () => openAiChatPanel(conn.id) },
    { label: refreshPending ? 'Reloading…' : 'Reload', icon: RefreshCw, onClick: onRefresh },
    { label: 'Edit', icon: Settings2, onClick: onEdit },
    { label: 'Delete', icon: Trash2, onClick: onDelete, destructive: true },
  ];

  return (
    <TooltipContent
      side="right"
      align="start"
      sideOffset={32}
      className="block max-w-none min-w-[11rem] rounded-lg border bg-popover p-2 shadow-xl"
    >
      <div className="flex items-center gap-2.5 px-2.5 py-2">
        <span className="size-2.5 rounded-full shrink-0 ring-1 ring-black/20" style={{ backgroundColor: color }} />
        <span className="text-sm font-semibold truncate flex-1 leading-tight text-foreground">{conn.name}</span>
        {latency != null && (
          <span className="text-xs text-muted-foreground tabular-nums shrink-0 leading-tight">{latency}ms</span>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground px-2.5 pb-1 truncate leading-tight capitalize">
        {conn.kind}
        {conn.host ? ` · ${conn.host}${conn.port ? `:${conn.port}` : ''}` : ''}
        {conn.database ? ` · ${conn.database}` : ''}
      </p>

      <div className="h-px bg-border/60 mx-1 my-[3px]" />

      {openActions.map((a) => (
        <ActionRow key={a.label} a={a} />
      ))}

      {toolActions.length > 0 && (
        <>
          <div className="h-px bg-border/60 mx-1 my-[3px]" />
          {toolActions.map((a) => (
            <ActionRow key={a.label} a={a} />
          ))}
        </>
      )}

      <div className="h-px bg-border/60 mx-1 my-[3px]" />
      {manageActions.map((a) => (
        <ActionRow key={a.label} a={a} />
      ))}
    </TooltipContent>
  );
}
