import { useStore } from '@tanstack/react-store';
import { useState, useMemo } from 'react';
import { useConnections } from '@/hooks/use-connections';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Database,
  Loader2,
  ChevronRight,
  ChevronDown,
  Pencil,
  Trash2,
  Terminal,
  Sparkles,
  Settings2,
} from 'lucide-react';
import { ConnectionDialog } from './connection-dialog';
import { SchemaTree } from './schema-tree';
import { MongoExplorer } from './mongo-explorer';
import { useDeleteConnection } from '@/hooks/use-connections';
import { appStore, setActiveConnection, openTab, openNewQueryTab, navigateTo } from '@/store';
import type { ConnectionProfile } from '@kamehadb/shared';

const kindColors: Record<string, string> = {
  postgres: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  sqlite: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  mysql: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  redis: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  mongodb: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
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
  const deleteConnection = useDeleteConnection();

  return (
    <div>
      <div className="flex items-center">
        <button
          onClick={() => {
            onSelect();
            setExpanded(!expanded);
          }}
          className={`flex-1 flex items-center gap-1.5 px-2 py-1.5 rounded-md text-left text-sm hover:bg-muted transition-colors ${
            isActive ? 'bg-muted' : ''
          }`}
        >
          {expanded ? <ChevronDown className="size-3 shrink-0" /> : <ChevronRight className="size-3 shrink-0" />}
          <Database className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate flex-1">{conn.name}</span>
          <span
            className="w-3 h-3 rounded-full shrink-0 border border-border/50"
            style={{ backgroundColor: conn.color ?? undefined }}
            title={conn.color ? `Custom color: ${conn.color}` : conn.kind}
          />
          <Badge
            variant="outline"
            className={`text-[10px] px-1 py-0 h-4 ${!conn.color ? (kindColors[conn.kind] ?? '') : ''}`}
          >
            {conn.kind}
          </Badge>
        </button>
        <div className="flex items-center gap-0.5 pr-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowEdit(true);
            }}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Edit connection"
          >
            <Pencil className="size-3" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`Delete connection "${conn.name}"?`)) {
                deleteConnection.mutate(conn.id);
              }
            }}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
            title="Delete connection"
          >
            <Trash2 className="size-3" />
          </button>
        </div>
      </div>
      {showEdit && (
        <ConnectionDialog open={showEdit} onOpenChange={(open) => setShowEdit(open)} editConnection={conn} />
      )}
      {expanded && isActive && (
        <div className="ml-3 pl-1 border-l border-border">
          {conn.kind === 'mongodb' ? (
            <MongoExplorer connectionId={conn.id} />
          ) : (
            <>
              <button
                onClick={() => openNewQueryTab(conn.id)}
                className="w-full flex items-center gap-1.5 px-2 py-1 text-xs hover:bg-muted rounded-md text-muted-foreground"
              >
                <Terminal className="size-3.5" />
                <span>New Query</span>
              </button>
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

const GROUP_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  postgres: Database,
  mysql: Database,
  sqlite: Database,
  redis: Database,
  mongodb: Database,
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
  const Icon = GROUP_ICONS[kind] ?? Database;

  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1.5 px-2 py-1">
        <Icon className="size-3 text-muted-foreground" />
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          {GROUP_LABELS[kind] ?? kind}
        </span>
        <span className="text-[10px] text-muted-foreground/50 ml-auto">{conns.length}</span>
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

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <span className="text-xs font-medium text-muted-foreground">Connections</span>
        <ConnectionDialog />
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
            view === 'api-settings' ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-muted-foreground'
          }`}
        >
          {view === 'api-settings' ? <Sparkles className="size-3.5" /> : <Settings2 className="size-3.5" />}
          <span>{view === 'api-settings' ? 'Back to Workspace' : 'API Settings'}</span>
        </button>
      </div>
    </div>
  );
}
