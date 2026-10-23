import { Spinner } from '@/components/ui/spinner';
import { Tooltip, TooltipTrigger } from '@/components/ui/tooltip';
import type { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip';
import { useConnections, useDeleteConnection, useRefreshConnection } from '@/hooks/use-connections';
import { api } from '@/lib/api';
import {
  SIDEBAR_DEFAULT_WIDTH as DEFAULT_WIDTH,
  GROUP_LABELS,
  GROUP_ORDER,
  SIDEBAR_MAX_WIDTH as MAX_WIDTH,
  SIDEBAR_MIN_WIDTH as MIN_WIDTH,
} from '@/lib/constants';
import { toastError } from '@/lib/toast';
import {
  appStore,
  closeTabsForConnection,
  openPostgresPsqlTab,
  openRedisTab,
  setActiveConnection,
  setConnectionLatency,
  setConnectionStatus,
  toggleExpandedConnection,
} from '@/store';
import type { ConnectionProfile, DbKind } from '@kamehadb/shared';
import { ALL_KINDS, safeErrorMessage } from '@kamehadb/shared';
import { useStore } from '@tanstack/react-store';
import { ChevronDown, ChevronRight, Pin } from 'lucide-react';
import type { ConnectionStatus } from './sidebar.helpers';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollIndicator } from '@/components/ui/scrollbar';
import { ConnectionDialog } from './connection-dialog';
import { DbIcon } from './db-icon';
import { PostgresBackupDialog } from './postgres-backup-dialog';
import { PostgresRestoreDialog } from './postgres-restore-dialog';
import { DeleteConfirmDialog } from './sidebar-delete-dialog';
import { ConnectionDropdownMenu } from './sidebar-dropdown-menu';
import { ConnectionStatusDot } from './sidebar-status-dot';
import { ConnectionTooltip } from './sidebar-tooltip';
import { MongoExplorer } from './mongo-explorer';
import { SchemaTree } from './schema-tree';
import { SidebarUpdateNotice } from './sidebar-update-notice';
import { SidebarDonateLink } from './sidebar-donate';
import { useUpdateCheck } from '@/hooks/use-update-check';

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

  const rowRef = useRef<HTMLDivElement>(null);

  const [showEdit, setShowEdit] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showBackup, setShowBackup] = useState(false);
  const [showRestore, setShowRestore] = useState(false);

  const deleteConnection = useDeleteConnection();
  const refreshConnection = useRefreshConnection();

  const status: ConnectionStatus = connectionStatus[conn.id] ?? 'disconnected';
  const latency = connectionLatency[conn.id];

  // Virtual anchor positioned at the right border of the sidebar at the vertical level of the row.
  // This guarantees the tooltip appears cleanly in the workspace canvas outside the sidebar,
  // making it physically impossible for the sidebar's scrollbar to intersect or render over it. (How / Why / What)
  const anchor = useMemo<TooltipPrimitive.Positioner.Props['anchor']>(
    () => ({
      getBoundingClientRect: () => {
        const el = rowRef.current;
        if (!el) return new DOMRect();
        const rect = el.getBoundingClientRect();
        const aside = el.closest('aside');
        const rightEdge = aside ? aside.getBoundingClientRect().right : rect.right;
        return new DOMRect(rightEdge, rect.top, 0, rect.height);
      },
      get contextElement() {
        return rowRef.current ?? undefined;
      },
    }),
    [],
  );

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
        ref={rowRef}
        role="button"
        tabIndex={0}
        onClick={handleRowActivate}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleRowActivate();
          }
        }}
        className={`group w-full flex items-center gap-1.5 px-1 py-1 rounded-lg text-left text-sm transition-all cursor-pointer ${
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

        <Tooltip>
          <TooltipTrigger className="flex min-w-0 flex-1 items-center justify-start gap-2 text-foreground/90 font-medium cursor-default text-left">
            <DbIcon kind={conn.kind} className="shrink-0 size-4" />
            <span className="min-w-0 flex-1 truncate">{conn.name}</span>
            {pinned && <Pin className="size-3 shrink-0 text-muted-foreground/50" />}
          </TooltipTrigger>
          <ConnectionTooltip conn={conn} status={status} latency={latency} anchor={anchor} />
        </Tooltip>

        <ConnectionDropdownMenu
          conn={conn}
          refreshConnection={refreshConnection}
          pinned={pinned}
          onEdit={() => setShowEdit(true)}
          onDelete={() => setShowDeleteConfirm(true)}
          onOpenPsql={() => {
            setActiveConnection(conn.id);
            openPostgresPsqlTab(conn.id);
          }}
          onBackup={() => setShowBackup(true)}
          onRestore={() => setShowRestore(true)}
        />

        <ConnectionStatusDot conn={conn} status={status} latency={latency} />
      </div>

      {showEdit && <ConnectionDialog open onOpenChange={setShowEdit} editConnection={conn} />}
      {conn.kind === 'postgres' && (
        <>
          <PostgresBackupDialog connection={conn} open={showBackup} onOpenChange={setShowBackup} />
          <PostgresRestoreDialog connection={conn} open={showRestore} onOpenChange={setShowRestore} />
        </>
      )}
      <DeleteConfirmDialog
        conn={conn}
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        onConfirm={() => {
          return deleteConnection
            .mutateAsync(conn.id)
            .then(() => {
              closeTabsForConnection(conn.id);
              setShowDeleteConfirm(false);
            })
            .catch((error: unknown) => toastError(safeErrorMessage(error, 'Failed to delete connection')));
        }}
      />

      {expanded && conn.kind !== 'redis' && (
        <div className="pl-2 ml-3 mt-0.5 border-border/60 border-l space-y-0.5">
          {conn.kind === 'mongodb' ? (
            <MongoExplorer key={conn.id} connectionId={conn.id} />
          ) : (
            <SchemaTree
              key={conn.id}
              connectionId={conn.id}
              activeTableId={activeTabId}
              onSelectTable={(tableId) => {
                const tabId = `${conn.id}:${tableId}`;
                const newTab = { id: tabId, type: 'table' as const, title: tableId, connectionId: conn.id };
                const exists = appStore.state.openedTabs.some((t) => t.id === tabId);
                appStore.setState((s) => ({
                  ...s,
                  activeConnectionId: conn.id,
                  view: 'workspace',
                  activeTabId: tabId,
                  openedTabs: exists ? s.openedTabs : [...s.openedTabs, newTab],
                }));
              }}
            />
          )}
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
      <div className={`flex items-center gap-1.5 px-1 py-0.5 rounded-md ${isPinned ? 'bg-muted/50' : 'bg-muted/30'}`}>
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
  const pinnedConnections = useStore(appStore, (s) => s.pinnedConnections);
  const updateCheck = useUpdateCheck();

  const [showCreate, setShowCreate] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const sidebarScrollRef = useRef<HTMLDivElement>(null);

  const groups = useMemo(() => {
    if (!connections) return [];
    const pinned: ConnectionProfile[] = [];
    const grouped: Record<string, ConnectionProfile[]> = {};
    for (const conn of connections) {
      if (!(ALL_KINDS as readonly string[]).includes(conn.kind)) continue;
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

  // Single health event stream for all connections — replaces per-item polling
  useEffect(() => {
    const reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

    const unsubscribe = api.onConnectionHealth((results) => {
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
    });

    // First round immediately — the backend ticks every 60s; the SSE stream
    // used to yield a round on connect too.
    void api.checkAllConnectionHealth().then((results) => {
      for (const [id, r] of Object.entries(results)) {
        if (r.success) {
          if (r.latencyMs !== undefined) setConnectionLatency(id, r.latencyMs);
          else setConnectionStatus(id, 'connected');
        }
      }
    });

    return () => {
      unsubscribe();
      for (const timer of reconnectTimers.values()) clearTimeout(timer);
    };
  }, []);

  return (
    <aside
      ref={sidebarRef}
      className="relative flex h-full bg-muted/30 border-border border-r shrink-0"
      style={{ width: sidebarWidth, minWidth: sidebarWidth, maxWidth: sidebarWidth }}
    >
      {/* Overflow is owned by index.css: unscrollable until hovered so WebKitGTK only
          reveals this pane's overlay scrollbar, not the table's. (Why) */}
      <div className="flex flex-1 flex-col h-full min-w-0">
        {/* Scroll slot wraps only the list so the bar never spans header/footer. (Why) */}
        <div className="flex h-8 items-center justify-between px-2 border-b border-border shrink-0">
          <span className="text-muted-foreground text-xs font-medium">Connections</span>
          <ConnectionDialog open={showCreate} onOpenChange={setShowCreate} />
        </div>

        {/* Relative wrapper anchors the custom scroll indicator over the list. (Why) */}
        <div className="relative flex-1 min-h-0">
          <div ref={sidebarScrollRef} data-slot="sidebar-scroll" className="no-scrollbar h-full p-1 space-y-1">
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
          <ScrollIndicator scrollerRef={sidebarScrollRef} orientation="vertical" autoHide />
        </div>

        {/* Footer: Update Available notice when a newer release is published. (How / Why / What) */}
        <SidebarUpdateNotice
          release={updateCheck.release}
          currentVersion={updateCheck.currentVersion}
          updateAvailable={updateCheck.updateAvailable}
          onDismiss={updateCheck.dismissUpdate}
        />
        <SidebarDonateLink />
      </div>

      <div
        onMouseDown={handleMouseDown}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        tabIndex={0}
        className={`absolute top-0 -right-0.5 bottom-0 w-1 cursor-col-resize z-20 transition-colors border-0 m-0 ${
          isResizing ? 'bg-primary' : 'bg-transparent hover:bg-border'
        }`}
      />
    </aside>
  );
}
