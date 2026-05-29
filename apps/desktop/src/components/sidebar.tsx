import { useStore } from '@tanstack/react-store';
import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useConnections, useDeleteConnection } from '@/hooks/use-connections';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Database,
  Loader2,
  ChevronRight,
  ChevronDown,
  MoreVertical,
  Terminal,
  Sparkles,
  Settings2,
  Share2,
  BarChart3,
  Trash2,
} from 'lucide-react';
import { ConnectionDialog } from './connection-dialog';
import { SchemaTree } from './schema-tree';
import { MongoExplorer } from './mongo-explorer';
import { api } from '@/lib/api';
import {
  appStore,
  setActiveConnection,
  openTab,
  openNewQueryTab,
  openGraphTab,
  navigateTo,
  toggleExpandedConnection,
  setConnectionStatus,
  openDatabaseStatsTab,
  openAiChatPanel,
} from '@/store';
import type { ConnectionProfile } from '@kamehadb/shared';

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
  const expanded = expandedConnections.includes(conn.id);
  const [showEdit, setShowEdit] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const deleteConnection = useDeleteConnection();
  const healthCheckTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const status = connectionStatus[conn.id] ?? 'connected';
  const indicatorColor = conn.color || (status === 'connected' ? '#22c55e' : '#ef4444');

  const checkConnectionHealth = useCallback(async () => {
    if (healthCheckTimeout.current) clearTimeout(healthCheckTimeout.current);
    healthCheckTimeout.current = setTimeout(async () => {
      try {
        const result = await api.checkConnectionHealth(conn.id);
        setConnectionStatus(conn.id, result.success ? 'connected' : 'disconnected');
      } catch {
        setConnectionStatus(conn.id, 'disconnected');
      }
    }, 500);
  }, [conn.id]);

  useEffect(() => {
    return () => {
      if (healthCheckTimeout.current) clearTimeout(healthCheckTimeout.current);
    };
  }, []);

  useEffect(() => {
    // Check health on mount
    checkConnectionHealth();
  }, [checkConnectionHealth]);

  return (
    <div className="relative group">
      <div
        className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-sm transition-all ${
          isActive ? 'bg-muted/60 shadow-sm' : 'hover:bg-muted/50'
        }`}
      >
        <button
          onClick={() => {
            onSelect();
            checkConnectionHealth();
            if (conn.kind !== 'redis') {
              toggleExpandedConnection(conn.id);
            }
          }}
          className="flex items-center gap-2 flex-1 min-w-0"
        >
          {conn.kind !== 'redis' ? (
            expanded ? (
              <ChevronDown className="size-4 shrink-0 text-muted-foreground/50 group-hover:text-foreground/70 transition-colors" />
            ) : (
              <ChevronRight className="size-4 shrink-0 text-muted-foreground/50 group-hover:text-foreground/70 transition-colors" />
            )
          ) : (
            <span className="size-4 shrink-0" />
          )}
          <Database className="size-4 shrink-0 text-muted-foreground/60" />
          <span className="truncate font-medium text-foreground/90" title={conn.name}>
            {conn.name}
          </span>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-md uppercase tracking-wide shrink-0 ${
              conn.kind === 'postgres'
                ? 'bg-primary/10 text-primary'
                : conn.kind === 'redis'
                  ? 'bg-destructive/10 text-destructive'
                  : conn.kind === 'mongodb'
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'bg-muted text-muted-foreground'
            }`}
          >
            {conn.kind}
          </span>
        </button>
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0 ring-2 ring-background"
          style={{
            backgroundColor: indicatorColor,
            boxShadow: status === 'connected' ? `0 0 8px ${indicatorColor}` : 'none',
          }}
          title={status}
        />
        <DropdownMenu>
          <DropdownMenuTrigger className="shrink-0 p-1 rounded hover:bg-muted/50 transition-colors opacity-0 group-hover:opacity-100">
            <MoreVertical className="size-3.5 text-muted-foreground/60 hover:text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={4}>
            <DropdownMenuItem onClick={() => openAiChatPanel(conn.id)}>
              <Sparkles className="size-3.5 mr-2" />
              AI Chat
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openGraphTab(conn.id)}>
              <Share2 className="size-3.5 mr-2" />
              Graph
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openDatabaseStatsTab(conn.id)}>
              <BarChart3 className="size-3.5 mr-2" />
              Stats
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setShowEdit(true)}>
              <Settings2 className="size-3.5 mr-2" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => setShowDeleteConfirm(true)}>
              <Trash2 className="size-3.5 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
      {expanded && (
        <div className="mt-1 ml-3 pl-2 border-l border-border/60 space-y-0.5">
          {conn.kind === 'mongodb' ? (
            <MongoExplorer connectionId={conn.id} />
          ) : conn.kind === 'redis' ? null : ( // Redis uses workspace tabs, not sidebar
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => openNewQueryTab(conn.id)}
                className="w-full justify-start gap-1.5 px-2 text-muted-foreground/80"
              >
                <Terminal className="size-3.5" />
                <span>New Query</span>
              </Button>
              <SchemaTree
                connectionId={conn.id}
                onSelectTable={(tableId) =>
                  openTab({
                    id: `${conn.id}:${tableId}`,
                    type: 'table',
                    title: tableId,
                    connectionId: conn.id,
                  })
                }
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
};

const GROUP_LABELS: Record<string, string> = {
  postgres: 'PostgreSQL',
  mysql: 'MySQL',
  sqlite: 'SQLite',
  redis: 'Redis',
  mongodb: 'MongoDB',
};

function ConnectionGroup({
  kind,
  conns,
  activeConnectionId,
}: {
  kind: string;
  conns: ConnectionProfile[];
  activeConnectionId: string | null;
}) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/30">
        <Database className="size-3.5 text-muted-foreground/50" />
        <span className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-widest">
          {GROUP_LABELS[kind] ?? kind}
        </span>
        <span className="ml-auto text-[10px] text-muted-foreground/40 tabular-nums">{conns.length}</span>
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

const MIN_WIDTH = 180;
const MAX_WIDTH = 400;
const DEFAULT_WIDTH = 260;

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

  return (
    <aside
      ref={sidebarRef}
      className="flex h-full border-r border-border bg-muted/30"
      style={{ width: sidebarWidth, minWidth: sidebarWidth }}
    >
      <div className="flex flex-col h-full flex-1 min-w-0">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
          <span className="text-xs font-medium text-muted-foreground">Connections</span>
          <ConnectionDialog open={showCreate} onOpenChange={setShowCreate} />
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="p-2 space-y-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              </div>
            ) : connections?.length === 0 ? (
              <p className="text-xs text-muted-foreground px-2 py-4 text-center">No connections yet</p>
            ) : (
              groups.map(([kind, conns]) => (
                <ConnectionGroup key={kind} kind={kind} conns={conns} activeConnectionId={activeConnectionId} />
              ))
            )}
          </div>
        </div>
        <div className="border-t border-border p-1.5 shrink-0">
          <button
            onClick={() => navigateTo(view === 'api-settings' ? 'workspace' : 'api-settings')}
            className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs transition-colors ${
              view === 'api-settings' ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50 text-muted-foreground'
            }`}
          >
            {view === 'api-settings' ? <Sparkles className="size-3.5" /> : <Settings2 className="size-3.5" />}
            <span>{view === 'api-settings' ? 'Back to Workspace' : 'API Settings'}</span>
          </button>
        </div>
      </div>
      {/* Resize handle */}
      <div
        onMouseDown={handleMouseDown}
        className={`w-1 cursor-col-resize shrink-0 transition-colors ${
          isResizing ? 'bg-primary' : 'bg-transparent hover:bg-border'
        }`}
      />
    </aside>
  );
}
