import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Tooltip, TooltipTrigger } from '@/components/ui/tooltip';
import {
  useConnectionHealth,
  useConnections,
  useDeleteConnection,
  useRefreshConnection,
} from '@/hooks/use-connections';
import { getApiBase } from '@/lib/api-client';
import {
  SIDEBAR_DEFAULT_WIDTH as DEFAULT_WIDTH,
  GROUP_LABELS,
  GROUP_ORDER,
  SIDEBAR_MAX_WIDTH as MAX_WIDTH,
  SIDEBAR_MIN_WIDTH as MIN_WIDTH,
} from '@/lib/constants';
import { isTauriRuntime } from '@/lib/tauri';
import {
  appStore,
  navigateTo,
  openRedisTab,
  setActiveConnection,
  setConnectionLatency,
  setConnectionStatus,
  toggleExpandedConnection,
} from '@/store';
import type { ConnectionProfile, DbKind } from '@kamehadb/shared';
import { isFileDatabaseKind } from '@kamehadb/shared';
import { useStore } from '@tanstack/react-store';
import { ChevronDown, ChevronRight, Pin, Settings2, Sparkles } from 'lucide-react';
import type { ConnectionStatus } from './sidebar.helpers';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ConnectionDialog } from './connection-dialog';
import { DbIcon } from './db-icon';
import { ClickHouseBackupDialog } from './clickhouse-backup-dialog';
import { ClickHouseRestoreDialog } from './clickhouse-restore-dialog';
import { FileDatabaseBackupDialog } from './file-database-backup-dialog';
import { FileDatabaseRestoreDialog } from './file-database-restore-dialog';
import { OracleBackupDialog } from './oracle-backup-dialog';
import { OracleRestoreDialog } from './oracle-restore-dialog';
import { PostgresBackupDialog } from './postgres-backup-dialog';
import { PostgresRestoreDialog } from './postgres-restore-dialog';
import { DeleteConfirmDialog } from './sidebar-delete-dialog';
import { ConnectionDropdownMenu } from './sidebar-dropdown-menu';
import { ConnectionExpansion } from './sidebar-expansion';
import { ConnectionStatusDot } from './sidebar-status-dot';
import { ConnectionTooltip } from './sidebar-tooltip';
import { SpinningRefresh } from './sidebar.helpers';

const ConnectionItem = memo(function ConnectionItem({
  conn,
  isActive,
}: {
  conn: ConnectionProfile;
  isActive: boolean;
}) {
  const expandedConnections = useStore(appStore, (s) => s.expandedConnections);
  const connectionStatus = useStore(appStore, (s) => s.connectionStatus);
  const connectionLatency = useStore(appStore, (s) => s.connectionLatency);
  const pinnedConnections = useStore(appStore, (s) => s.pinnedConnections);
  const activeTabId = useStore(appStore, (s) => s.activeTabId);

  const expanded = expandedConnections.includes(conn.id);
  const pinned = pinnedConnections.includes(conn.id);

  const [showEdit, setShowEdit] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showBackup, setShowBackup] = useState(false);
  const [showRestore, setShowRestore] = useState(false);

  const deleteConnection = useDeleteConnection();
  const refreshConnection = useRefreshConnection();
  const healthCheck = useConnectionHealth(conn.id);

  const status: ConnectionStatus =
    conn.id in connectionStatus ? connectionStatus[conn.id] : (healthCheck.data ?? 'disconnected');
  const latency = connectionLatency[conn.id];

  function handleRowActivate() {
    setActiveConnection(conn.id);
    if (conn.kind === 'redis') {
      openRedisTab(conn.id);
    } else {
      toggleExpandedConnection(conn.id);
    }
  }

  return (
    <div className="relative grow">
      <div
        role="button"
        tabIndex={0}
        onClick={handleRowActivate}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleRowActivate();
          }
        }}
        className={`group w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-sm transition-all cursor-pointer ${
          isActive ? 'bg-muted/60 shadow-sm' : 'hover:bg-muted/50'
        }`}
      >
        {conn.kind !== 'redis' ? (
          expanded ? (
            <ChevronDown className="shrink-0 size-4 transition-colors group-hover:text-foreground/70" />
          ) : (
            <ChevronRight className="shrink-0 size-4 transition-colors group-hover:text-foreground/70" />
          )
        ) : (
          <span className="shrink-0 size-4" />
        )}

        <DbIcon kind={conn.kind} className="shrink-0 size-4" />

        <Tooltip>
          <TooltipTrigger className="flex min-w-0 flex-1 items-center justify-start gap-1.5 text-foreground/90 font-medium cursor-default text-left">
            <span className="min-w-0 flex-1 truncate">{conn.name}</span>
            {pinned && <Pin className="size-3 shrink-0 text-muted-foreground/50" />}
          </TooltipTrigger>
          <ConnectionTooltip conn={conn} status={status} latency={latency} />
        </Tooltip>

        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            refreshConnection.mutate(conn.id);
          }}
          disabled={refreshConnection.isPending}
          className="opacity-0 size-6 disabled:opacity-100 group-hover:opacity-100"
          title="Reload connection"
          aria-label="Reload connection"
        >
          <SpinningRefresh
            spinning={refreshConnection.isPending}
            className="text-muted-foreground/60 hover:text-foreground"
          />
        </Button>
        <ConnectionDropdownMenu
          conn={conn}
          refreshConnection={refreshConnection}
          pinned={pinned}
          onEdit={() => setShowEdit(true)}
          onDelete={() => setShowDeleteConfirm(true)}
          onBackup={() => setShowBackup(true)}
          onRestore={() => setShowRestore(true)}
        />

        <ConnectionStatusDot conn={conn} status={status} latency={latency} />
      </div>

      {showEdit && <ConnectionDialog open onOpenChange={setShowEdit} editConnection={conn} />}
      {conn.kind === 'postgres' && isTauriRuntime() && (
        <>
          <PostgresBackupDialog connection={conn} open={showBackup} onOpenChange={setShowBackup} />
          <PostgresRestoreDialog connection={conn} open={showRestore} onOpenChange={setShowRestore} />
        </>
      )}
      {isFileDatabaseKind(conn.kind) && isTauriRuntime() && (
        <>
          <FileDatabaseBackupDialog connection={conn} open={showBackup} onOpenChange={setShowBackup} />
          <FileDatabaseRestoreDialog connection={conn} open={showRestore} onOpenChange={setShowRestore} />
        </>
      )}
      {conn.kind === 'clickhouse' && (
        <>
          <ClickHouseBackupDialog connection={conn} open={showBackup} onOpenChange={setShowBackup} />
          <ClickHouseRestoreDialog connection={conn} open={showRestore} onOpenChange={setShowRestore} />
        </>
      )}
      {conn.kind === 'oracle' && isTauriRuntime() && (
        <>
          <OracleBackupDialog connection={conn} open={showBackup} onOpenChange={setShowBackup} />
          <OracleRestoreDialog connection={conn} open={showRestore} onOpenChange={setShowRestore} />
        </>
      )}
      <DeleteConfirmDialog
        conn={conn}
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        onConfirm={() => {
          deleteConnection.mutate(conn.id);
          setShowDeleteConfirm(false);
        }}
      />

      {expanded && conn.kind !== 'redis' && (
        <div className="pl-2 ml-3 mt-1 border-border/60 border-l space-y-0.5">
          <ConnectionExpansion conn={conn} activeTabId={activeTabId} />
        </div>
      )}
    </div>
  );
});

function ConnectionGroup({
  kind,
  conns,
  activeConnectionId,
}: {
  kind: string;
  conns: ConnectionProfile[];
  activeConnectionId: string | null;
}) {
  const isPinned = kind === '_pinned';
  return (
    <div className="space-y-0.5">
      <div className={`flex items-center gap-2 px-2 py-1.5 rounded-md ${isPinned ? 'bg-muted/50' : 'bg-muted/30'}`}>
        {isPinned ? (
          <Pin className="size-3 text-muted-foreground/60" />
        ) : (
          <DbIcon kind={kind as DbKind} className="size-3.5" />
        )}
        <span className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-widest">
          {isPinned ? 'Pinned' : (GROUP_LABELS[kind as DbKind] ?? kind)}
        </span>
        <span className="ml-auto text-xs text-muted-foreground/40 tabular-nums">{conns.length}</span>
      </div>
      {conns.map((conn) => (
        <ConnectionItem key={conn.id} conn={conn} isActive={conn.id === activeConnectionId} />
      ))}
    </div>
  );
}

export function Sidebar() {
  const { data: connections, isLoading } = useConnections();
  const activeConnectionId = useStore(appStore, (s) => s.activeConnectionId);
  const view = useStore(appStore, (s) => s.view);
  const pinnedConnections = useStore(appStore, (s) => s.pinnedConnections);

  const [showCreate, setShowCreate] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const groups = useMemo(() => {
    if (!connections) return [];
    const pinned: ConnectionProfile[] = [];
    const grouped: Record<string, ConnectionProfile[]> = {};
    for (const conn of connections) {
      if (pinnedConnections.includes(conn.id)) {
        pinned.push(conn);
      } else {
        const key = conn.kind in GROUP_ORDER ? conn.kind : 'other';
        (grouped[key] ??= []).push(conn);
      }
    }
    const entries: [string, ConnectionProfile[]][] = [];
    if (pinned.length > 0) entries.push(['_pinned', pinned]);
    entries.push(...Object.entries(grouped).sort(([a], [b]) => (GROUP_ORDER[a] ?? 99) - (GROUP_ORDER[b] ?? 99)));
    return entries;
  }, [connections, pinnedConnections]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;
    const onMove = (e: MouseEvent) => setSidebarWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX)));
    const onUp = () => setIsResizing(false);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [isResizing]);

  // Single SSE stream for all connection health — replaces per-item polling
  useEffect(() => {
    const es = new EventSource(`${getApiBase()}/connections/health`);
    const reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

    es.onmessage = (event) => {
      try {
        const results: Record<string, { success: boolean; latencyMs?: number }> = JSON.parse(event.data);
        for (const [id, r] of Object.entries(results)) {
          if (r.success) {
            clearTimeout(reconnectTimers.get(id));
            reconnectTimers.delete(id);
            if (r.latencyMs !== undefined) setConnectionLatency(id, r.latencyMs);
            else setConnectionStatus(id, 'connected');
          } else {
            const prev = appStore.state.connectionStatus[id];
            if (prev === 'connected' || prev === 'slow') {
              setConnectionStatus(id, 'reconnecting');
              const timer = setTimeout(() => {
                if (appStore.state.connectionStatus[id] === 'reconnecting') {
                  setConnectionStatus(id, 'disconnected');
                }
                reconnectTimers.delete(id);
              }, 5000);
              reconnectTimers.set(id, timer);
            } else if (prev !== 'reconnecting') {
              setConnectionStatus(id, 'disconnected');
            }
          }
        }
      } catch {
        // Malformed SSE payload — skip
      }
    };

    return () => {
      es.close();
      for (const timer of reconnectTimers.values()) clearTimeout(timer);
    };
  }, []);

  return (
    <aside
      ref={sidebarRef}
      className="flex h-full bg-muted/30 border-border border-r"
      style={{ width: sidebarWidth, minWidth: sidebarWidth }}
    >
      <div className="flex flex-1 flex-col h-full min-w-0 overflow-x-hidden overflow-y-auto">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
          <span className="text-muted-foreground text-xs font-medium">Connections</span>
          <ConnectionDialog open={showCreate} onOpenChange={setShowCreate} />
        </div>

        <div className="flex-1 p-2 space-y-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner size="md" />
            </div>
          ) : connections?.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs">No connections yet</p>
          ) : (
            groups.map(([kind, conns]) => (
              <ConnectionGroup key={kind} kind={kind} conns={conns} activeConnectionId={activeConnectionId} />
            ))
          )}
        </div>

        <div className="p-1.5 border-border border-t shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigateTo(view === 'api-settings' ? 'workspace' : 'api-settings')}
            className={`w-full ${view === 'api-settings' ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50 text-muted-foreground'}`}
          >
            {view === 'api-settings' ? <Sparkles className="size-3.5" /> : <Settings2 className="size-3.5" />}
            <span>{view === 'api-settings' ? 'Back to Workspace' : 'API Settings'}</span>
          </Button>
        </div>
      </div>

      <div
        onMouseDown={handleMouseDown}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        tabIndex={0}
        className={`w-1 cursor-col-resize shrink-0 transition-colors border-0 m-0 ${
          isResizing ? 'bg-primary' : 'bg-transparent hover:bg-border'
        }`}
      />
    </aside>
  );
}
