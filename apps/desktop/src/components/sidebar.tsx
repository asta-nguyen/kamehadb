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
import {
  useConnections,
  useDeleteConnection,
  useRefreshConnection,
  useConnectionHealth,
} from '@/hooks/use-connections';
import { getApiBase } from '@/lib/api';
import {
  appStore,
  navigateTo,
  openAiChatPanel,
  openDatabaseStatsTab,
  openGraphTab,
  openMongoQueryTab,
  openNewQueryTab,
  openQdrantSearchTab,
  openRedisQueryTab,
  openRedisTab,
  setActiveConnection,
  setConnectionStatus,
  toggleExpandedConnection,
} from '@/store';
import type { ConnectionProfile } from '@kamehadb/shared';
import { useStore } from '@tanstack/react-store';
import {
  BarChart3,
  ChevronDown,
  ChevronRight,
  Database,
  FileText,
  Loader2,
  MoreVertical,
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
import { MongoExplorer } from './mongo-explorer';
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
  const activeTabId = useStore(appStore, (state) => state.activeTabId);
  const expanded = expandedConnections.includes(conn.id);
  const [showEdit, setShowEdit] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const deleteConnection = useDeleteConnection();
  const refreshConnection = useRefreshConnection();
  const healthCheck = useConnectionHealth(conn.id);

  const status = healthCheck.data ?? connectionStatus[conn.id] ?? 'disconnected';
  const indicatorColor = conn.color || (status === 'connected' ? '#22c55e' : '#ef4444');

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
        <Database className="text-muted-foreground/60 shrink-0 size-4" />
        <span className="flex-1 min-w-0 text-foreground/90 font-medium truncate" title={conn.name}>
          {conn.name}
        </span>
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
            <DropdownMenuItem onClick={() => openAiChatPanel(conn.id)}>
              <Sparkles className="mr-2 size-3.5" />
              AI Chat
            </DropdownMenuItem>
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
                <DropdownMenuItem
                  onClick={() => {
                    setActiveConnection(conn.id);
                    openDatabaseStatsTab(conn.id);
                  }}
                >
                  <BarChart3 className="mr-2 size-3.5" />
                  Stats
                </DropdownMenuItem>
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
          className={`text-xs px-1.5 py-0.5 rounded-md uppercase tracking-wide shrink-0 ${
            conn.kind === 'postgres'
              ? 'bg-primary/10 text-primary'
              : conn.kind === 'redis'
                ? 'bg-destructive/10 text-destructive'
                : conn.kind === 'mongodb'
                  ? 'bg-primary/10 text-primary'
                  : 'bg-muted text-muted-foreground'
          }`}
        >
          {conn.kind}
        </span>
        <span
          className="h-2.5 w-2.5 rounded-full ring-2 ring-background shrink-0"
          style={{
            backgroundColor: indicatorColor,
            boxShadow: status === 'connected' ? `0 0 8px ${indicatorColor}` : 'none',
          }}
          title={status}
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

const GROUP_ORDER: Record<string, number> = {
  postgres: 0,
  mysql: 1,
  sqlite: 2,
  redis: 3,
  mongodb: 4,
  qdrant: 5,
  sqlserver: 6,
  oracle: 7,
  clickhouse: 8,
  mariadb: 9,
  duckdb: 10,
  tigerbeetle: 11,
};

function ConnectionGroup({
  conns,
  activeConnectionId,
}: {
  conns: ConnectionProfile[];
  activeConnectionId: string | null;
}) {
  return (
    <div className="space-y-0.5">
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

const MIN_WIDTH = 250;
const MAX_WIDTH = 400;
const DEFAULT_WIDTH = 300;

export function Sidebar() {
  const { data: connections, isLoading } = useConnections();
  const activeConnectionId = useStore(appStore, (state) => state.activeConnectionId);
  const view = useStore(appStore, (state) => state.view);
  const [showCreate, setShowCreate] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const groups = useMemo(() => {
    if (!connections) return [];
    const grouped: Record<string, ConnectionProfile[]> = {};
    for (const conn of connections) {
      const key = conn.kind in GROUP_ORDER ? conn.kind : 'other';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(conn);
    }
    return Object.entries(grouped).sort(([a], [b]) => (GROUP_ORDER[a] ?? 99) - (GROUP_ORDER[b] ?? 99));
  }, [connections]);

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
    es.onmessage = (event) => {
      try {
        const results: Record<string, { success: boolean }> = JSON.parse(event.data);
        for (const [id, r] of Object.entries(results)) {
          setConnectionStatus(id, r.success ? 'connected' : 'disconnected');
        }
      } catch {
        // Malformed SSE payload — skip
      }
    };
    es.onerror = () => {
      // Connection lost — the browser will auto-reconnect
    };
    return () => es.close();
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
                <ConnectionGroup key={kind} conns={conns} activeConnectionId={activeConnectionId} />
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
