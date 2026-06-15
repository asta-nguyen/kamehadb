import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  useConnections,
  useDeleteConnection,
  useRefreshConnection,
  useConnectionHealth,
} from '@/hooks/use-connections';
import { getApiBase } from '@/lib/api';
import {
  GROUP_LABELS,
  GROUP_ORDER,
  SIDEBAR_MIN_WIDTH as MIN_WIDTH,
  SIDEBAR_MAX_WIDTH as MAX_WIDTH,
  SIDEBAR_DEFAULT_WIDTH as DEFAULT_WIDTH,
} from '@/lib/constants';
import {
  appStore,
  navigateTo,
  openAiChatPanel,
  openDatabaseStatsTab,
  openGraphTab,
  openMongoQueryTab,
  openNewQueryTab,
  openPostgresPsqlTab,
  openQdrantSearchTab,
  openRedisQueryTab,
  openRedisTab,
  openMigrationTab,
  openSchemaTimelineTab,
  setActiveConnection,
  setConnectionLatency,
  setConnectionStatus,
  toggleExpandedConnection,
  togglePinnedConnection,
} from '@/store';
import type { ConnectionProfile } from '@kamehadb/shared';
import { useStore } from '@tanstack/react-store';
import {
  BarChart3,
  ChevronDown,
  ChevronRight,
  FileText,
  History,
  Loader2,
  MoreVertical,
  Pin,
  PinOff,
  RefreshCw,
  Search,
  Settings2,
  Share2,
  Sparkles,
  Terminal,
  Trash2,
} from 'lucide-react';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ConnectionDialog } from './connection-dialog';
import { DbIcon } from './db-icon';
import { MongoExplorer } from './mongo-explorer';
import { PostgresMaintenanceMenu } from './postgres-maintenance-menu';
import { QdrantExplorer } from './qdrant-explorer';
import { TigerBeetleExplorer } from './tigerbeetle-explorer';
import { SchemaTree } from './schema-tree';

function SpinningRefresh({ spinning, className = '' }: { spinning: boolean; className?: string }) {
  return <RefreshCw className={`size-3.5 ${className} ${spinning ? 'animate-spin' : ''}`} />;
}

function ConnectionItem({
  conn,
  isActive,
  onSelect,
}: {
  conn: ConnectionProfile;
  isActive: boolean;
  onSelect: () => void;
}) {
  const expandedConnections = useStore(appStore, (state) => state.expandedConnections);
  const connectionStatus = useStore(appStore, (state) => state.connectionStatus);
  const connectionLatency = useStore(appStore, (state) => state.connectionLatency);
  const pinnedConnections = useStore(appStore, (state) => state.pinnedConnections);
  const activeTabId = useStore(appStore, (state) => state.activeTabId);
  const expanded = expandedConnections.includes(conn.id);
  const pinned = pinnedConnections.includes(conn.id);
  const [showEdit, setShowEdit] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const deleteConnection = useDeleteConnection();
  const refreshConnection = useRefreshConnection();
  const healthCheck = useConnectionHealth(conn.id);

  // SSE is the primary health source (has latency + reconnecting states).
  // Fall back to healthCheck on first render before SSE arrives.
  const status = conn.id in connectionStatus ? connectionStatus[conn.id] : (healthCheck.data ?? 'disconnected');
  const latency = connectionLatency[conn.id];
  const indicatorColor =
    status === 'connected'
      ? conn.color || '#22c55e'
      : status === 'slow'
        ? '#eab308'
        : status === 'reconnecting'
          ? '#f97316'
          : '#ef4444';
  const statusLabel =
    status === 'connected' && latency !== undefined
      ? `Connected • ${latency}ms`
      : status === 'slow'
        ? `Slow • ${latency}ms`
        : status === 'reconnecting'
          ? 'Reconnecting…'
          : 'Offline';

  return (
    <div className="relative grow">
      <div
        onClick={() => {
          onSelect();
          if (conn.kind === 'redis') {
            openRedisTab(conn.id);
          } else {
            toggleExpandedConnection(conn.id);
          }
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect();
            if (conn.kind === 'redis') {
              openRedisTab(conn.id);
            } else {
              toggleExpandedConnection(conn.id);
            }
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
          <TooltipContent side="right" align="start" sideOffset={12} className="rounded-lg shadow-sm px-4 py-3">
            <div className="text-xs leading-relaxed min-w-45">
              <p className="font-semibold mb-2">{conn.name}</p>
              <div className="space-y-1.5 text-popover-foreground/65">
                <div className="flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full shrink-0" style={{ backgroundColor: indicatorColor }} />
                  <span>{statusLabel}</span>
                </div>
                <p className="capitalize">
                  {conn.kind}
                  {conn.host ? ` · ${conn.host}:${conn.port}` : ''}
                </p>
                {conn.database && <p>db: {conn.database}</p>}
                {conn.updatedAt && (
                  <p className="text-popover-foreground/40 text-[10px]">
                    {new Date(conn.updatedAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                )}
              </div>
            </div>
          </TooltipContent>
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
        <DropdownMenu>
          <DropdownMenuTrigger
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center justify-center rounded-md opacity-0 size-6 transition-colors hover:bg-muted/50 group-hover:opacity-100"
          >
            <MoreVertical className="text-muted-foreground/60 size-3.5 hover:text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={4}>
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
            {conn.kind === 'postgres' ? (
              <PostgresMaintenanceMenu
                onOpenPsql={() => {
                  setActiveConnection(conn.id);
                  openPostgresPsqlTab(conn.id, conn.database);
                }}
              />
            ) : null}
            {conn.kind !== 'mongodb' &&
              conn.kind !== 'redis' &&
              conn.kind !== 'qdrant' &&
              conn.kind !== 'tigerbeetle' && (
                <>
                  <DropdownMenuItem
                    onClick={() => {
                      setActiveConnection(conn.id);
                      openNewQueryTab(conn.id);
                    }}
                  >
                    <FileText className="mr-2 size-3.5" />
                    New Query
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setActiveConnection(conn.id);
                      openGraphTab(conn.id);
                    }}
                  >
                    <Share2 className="mr-2 size-3.5" />
                    Graph
                  </DropdownMenuItem>
                </>
              )}
            {conn.kind === 'qdrant' && (
              <DropdownMenuItem
                onClick={() => {
                  setActiveConnection(conn.id);
                  openQdrantSearchTab(conn.id);
                }}
              >
                <Search className="mr-2 size-3.5" />
                Vector Search
              </DropdownMenuItem>
            )}
            {conn.kind === 'mongodb' && (
              <DropdownMenuItem
                onClick={() => {
                  setActiveConnection(conn.id);
                  openMongoQueryTab(conn.id, appStore.state.activeMongoDatabase ?? 'admin', '');
                }}
              >
                <Terminal className="mr-2 size-3.5" />
                Aggregation
              </DropdownMenuItem>
            )}
            {conn.kind === 'redis' && (
              <>
                <DropdownMenuItem
                  onClick={() => {
                    setActiveConnection(conn.id);
                    openRedisQueryTab(conn.id);
                  }}
                >
                  <Terminal className="mr-2 size-3.5" />
                  Query
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setActiveConnection(conn.id);
                    openRedisTab(conn.id);
                  }}
                >
                  <BarChart3 className="mr-2 size-3.5" />
                  Stats
                </DropdownMenuItem>
              </>
            )}
            {conn.kind !== 'mongodb' &&
              conn.kind !== 'redis' &&
              conn.kind !== 'qdrant' &&
              conn.kind !== 'tigerbeetle' && (
                <>
                  <DropdownMenuItem
                    onClick={() => {
                      setActiveConnection(conn.id);
                      openDatabaseStatsTab(conn.id);
                    }}
                  >
                    <BarChart3 className="mr-2 size-3.5" />
                    Stats
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setActiveConnection(conn.id);
                      openSchemaTimelineTab(conn.id);
                    }}
                  >
                    <History className="mr-2 size-3.5" />
                    Schema Timeline
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setActiveConnection(conn.id);
                      openMigrationTab(conn.id);
                    }}
                  >
                    <Terminal className="mr-2 size-3.5" />
                    Migration Assistant
                  </DropdownMenuItem>
                </>
              )}
            <DropdownMenuItem onClick={() => setShowEdit(true)}>
              <Settings2 className="mr-2 size-3.5" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => setShowDeleteConfirm(true)}>
              <Trash2 className="mr-2 size-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <span
          className={`h-2.5 w-2.5 rounded-full ring-2 ring-background shrink-0 ${status === 'reconnecting' ? 'animate-pulse' : ''}`}
          style={{
            backgroundColor: indicatorColor,
            boxShadow: status === 'connected' || status === 'slow' ? `0 0 8px ${indicatorColor}` : 'none',
          }}
          title={statusLabel}
        />
      </div>
      {showEdit && (
        <ConnectionDialog open={showEdit} onOpenChange={(open) => setShowEdit(open)} editConnection={conn} />
      )}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{conn.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                deleteConnection.mutate(conn.id);
                setShowDeleteConfirm(false);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {expanded && conn.kind !== 'redis' && (
        <div className="pl-2 ml-3 mt-1 border-border/60 border-l space-y-0.5">
          {conn.kind === 'mongodb' ? (
            <>
              <MongoExplorer key={conn.id} connectionId={conn.id} />
            </>
          ) : conn.kind === 'qdrant' ? (
            <>
              <QdrantExplorer key={conn.id} connectionId={conn.id} />
            </>
          ) : conn.kind === 'tigerbeetle' ? (
            <TigerBeetleExplorer key={conn.id} connectionId={conn.id} />
          ) : (
            <>
              <SchemaTree
                key={conn.id}
                connectionId={conn.id}
                activeTableId={activeTabId}
                onSelectTable={(tableId) => {
                  const newTab = {
                    id: `${conn.id}:${tableId}`,
                    type: 'table' as const,
                    title: tableId,
                    connectionId: conn.id,
                  };
                  const existingTab = appStore.state.openedTabs.find((t) => t.id === newTab.id);
                  if (existingTab) {
                    appStore.setState((s) => ({ ...s, view: 'workspace', activeTabId: newTab.id }));
                  } else {
                    appStore.setState((s) => ({
                      ...s,
                      view: 'workspace',
                      openedTabs: [...s.openedTabs, newTab],
                      activeTabId: newTab.id,
                    }));
                  }
                }}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

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
          <DbIcon kind={kind as any} className="size-3.5" />
        )}
        <span className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-widest">
          {isPinned ? 'Pinned' : (GROUP_LABELS[kind] ?? kind)}
        </span>
        <span className="ml-auto text-xs text-muted-foreground/40 tabular-nums">{conns.length}</span>
      </div>
      {conns.map((conn) => (
        <ConnectionItem
          key={conn.id}
          conn={conn}
          isActive={conn.id === activeConnectionId}
          onSelect={() => setActiveConnection(conn.id)}
        />
      ))}
    </div>
  );
}

export function Sidebar() {
  const { data: connections, isLoading } = useConnections();
  const activeConnectionId = useStore(appStore, (state) => state.activeConnectionId);
  const view = useStore(appStore, (state) => state.view);
  const [showCreate, setShowCreate] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const pinnedConnections = useStore(appStore, (state) => state.pinnedConnections);
  const groups = useMemo(() => {
    if (!connections) return [];
    const pinned: ConnectionProfile[] = [];
    const grouped: Record<string, ConnectionProfile[]> = {};
    for (const conn of connections) {
      if (pinnedConnections.includes(conn.id)) {
        pinned.push(conn);
      } else {
        const key = conn.kind in GROUP_ORDER ? conn.kind : 'other';
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(conn);
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

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  // Single EventSource for health status — replaces per-item polling
  useEffect(() => {
    const url = `${getApiBase()}/connections/health`;
    const es = new EventSource(url);
    // Track reconnecting grace period per connection
    const reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

    es.onmessage = (event) => {
      try {
        const results: Record<string, { success: boolean; latencyMs?: number }> = JSON.parse(event.data);
        for (const [id, r] of Object.entries(results)) {
          if (r.success) {
            // Clear any pending reconnect timer
            const timer = reconnectTimers.get(id);
            if (timer) {
              clearTimeout(timer);
              reconnectTimers.delete(id);
            }
            if (r.latencyMs !== undefined) {
              setConnectionLatency(id, r.latencyMs);
            } else {
              setConnectionStatus(id, 'connected');
            }
          } else {
            // Failed — show reconnecting briefly, then settle on disconnected.
            // Don't call setConnectionLatency here — it derives status as
            // 'connected'/'slow' from latencyMs, which would overwrite the
            // disconnected/reconnecting status we just set.
            const prevStatus = appStore.state.connectionStatus[id];
            if (prevStatus === 'connected' || prevStatus === 'slow') {
              setConnectionStatus(id, 'reconnecting');
              const timer = setTimeout(() => {
                const s = appStore.state.connectionStatus[id];
                if (s === 'reconnecting') {
                  setConnectionStatus(id, 'disconnected');
                }
                reconnectTimers.delete(id);
              }, 5000);
              reconnectTimers.set(id, timer);
            } else if (prevStatus !== 'reconnecting') {
              setConnectionStatus(id, 'disconnected');
            }
          }
        }
      } catch {
        // Malformed SSE payload — skip
      }
    };
    es.onerror = () => {
      // Connection lost — the browser will auto-reconnect
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
        <div className="flex-1">
          <div className="p-2 space-y-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="text-muted-foreground animate-spin size-4" />
              </div>
            ) : connections?.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs">No connections yet</p>
            ) : (
              groups.map(([kind, conns]) => (
                <ConnectionGroup key={kind} kind={kind} conns={conns} activeConnectionId={activeConnectionId} />
              ))
            )}
          </div>
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
      {/* Resize handle */}
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
