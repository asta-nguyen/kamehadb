import { useStore } from '@tanstack/react-store';
import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useConnections, useDeleteConnection } from '@/hooks/use-connections';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
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
} from 'lucide-react';
import { ConnectionDialog } from './connection-dialog';
import { SchemaTree } from './schema-tree';
import { MongoExplorer } from './mongo-explorer';
import { appStore, setActiveConnection, openTab, openNewQueryTab, navigateTo } from '@/store';
import type { ConnectionProfile } from '@kamehadb/shared';

const kindColors: Record<string, string> = {
  postgres: 'bg-primary/10 text-primary',
  sqlite: 'bg-muted text-muted-foreground',
  mysql: 'bg-accent text-accent-foreground',
  redis: 'bg-destructive/10 text-destructive',
  mongodb: 'bg-card text-card-foreground',
};

function ConnectionItem({
  conn,
  isActive,
  onSelect,
}: {
  conn: ConnectionProfile;
  isActive: boolean;
  onSelect: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const deleteConnection = useDeleteConnection();

  return (
    <div className="relative">
      <div className="flex items-center gap-1">
        <button
          onClick={() => {
            onSelect();
            // Don't expand for Redis - it uses workspace tabs
            if (conn.kind !== 'redis') {
              setExpanded(!expanded);
            }
          }}
          className={`flex-1 flex items-center gap-1.5 px-2 py-1.5 rounded-md text-left text-sm hover:bg-muted/70 transition-colors ${
            isActive ? 'bg-muted/50' : ''
          }`}
        >
          {conn.kind === 'redis' ? (
            <span className="size-3 shrink-0" /> // Spacer for Redis (no chevron)
          ) : expanded ? (
            <ChevronDown className="size-3 shrink-0 text-muted-foreground/60" />
          ) : (
            <ChevronRight className="size-3 shrink-0 text-muted-foreground/60" />
          )}
          <Database className="size-3.5 shrink-0 text-muted-foreground/70" />
          <span className="truncate flex-1 text-foreground/80">{conn.name}</span>
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0 border border-border/30"
            style={{ backgroundColor: conn.color ?? undefined }}
            title={conn.color ? `Custom color: ${conn.color}` : conn.kind}
          />
          <Badge
            variant="outline"
            className={`text-xs px-1 py-0 h-4 shrink-0 ${!conn.color ? (kindColors[conn.kind] ?? '') : ''}`}
          >
            {conn.kind}
          </Badge>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center justify-center size-6 rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted outline-none">
            <MoreVertical className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={2}>
            <DropdownMenuItem onClick={() => setShowEdit(true)}>Edit</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => setShowDeleteConfirm(true)}>
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
      {expanded && isActive && (
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
      <div className="flex items-center gap-1.5 px-2 py-1">
        <Database className="size-3 text-muted-foreground/60" />
        <span className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider">
          {GROUP_LABELS[kind] ?? kind}
        </span>
        <span className="text-xs text-muted-foreground/40 ml-auto tabular-nums">{conns.length}</span>
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
        <ScrollArea className="flex-1">
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
        </ScrollArea>
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
