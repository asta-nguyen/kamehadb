import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { isTauriRuntime } from '@/lib/tauri';
import { SpinningRefresh, isSqlLike } from './sidebar.helpers';
import {
  setActiveConnection,
  togglePinnedConnection,
  openAiChatPanel,
  openNewQueryTab,
  openGraphTab,
  openDatabaseStatsTab,
  openSchemaTimelineTab,
  openMigrationTab,
  openQdrantSearchTab,
  openMongoQueryTab,
  openMongoShellTab,
  openRedisQueryTab,
  openRedisTab,
  openSqliteVecSearchTab,
  appStore,
} from '@/store';
import type { ConnectionProfile } from '@kamehadb/shared';
import {
  Download,
  FileText,
  History,
  BarChart3,
  MoreVertical,
  Pin,
  PinOff,
  Search,
  Settings2,
  Share2,
  Sparkles,
  Terminal,
  Trash2,
  Upload,
} from 'lucide-react';

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

        {isSqlLike(conn.kind) && (
          <>
            <DropdownMenuItem onClick={() => activate(conn.id, openNewQueryTab)}>
              <FileText className="mr-2 size-3.5" />
              New Query
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => activate(conn.id, openGraphTab)}>
              <Share2 className="mr-2 size-3.5" />
              Graph
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => activate(conn.id, openDatabaseStatsTab)}>
              <BarChart3 className="mr-2 size-3.5" />
              Stats
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => activate(conn.id, openSchemaTimelineTab)}>
              <History className="mr-2 size-3.5" />
              Schema Timeline
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => activate(conn.id, openMigrationTab)}>
              <Terminal className="mr-2 size-3.5" />
              Migration Assistant
            </DropdownMenuItem>
          </>
        )}

        {conn.kind === 'qdrant' && (
          <DropdownMenuItem onClick={() => activate(conn.id, openQdrantSearchTab)}>
            <Search className="mr-2 size-3.5" />
            Vector Search
          </DropdownMenuItem>
        )}

        {conn.kind === 'sqlite' && (
          <DropdownMenuItem onClick={() => activate(conn.id, openSqliteVecSearchTab)}>
            <Search className="mr-2 size-3.5" />
            Vector Search
          </DropdownMenuItem>
        )}

        {conn.kind === 'mongodb' && (
          <>
            <DropdownMenuItem onClick={() => activate(conn.id, openMongoShellTab)}>
              <Terminal className="mr-2 size-3.5" />
              Mongo Shell
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                activate(conn.id, (id) => openMongoQueryTab(id, appStore.state.activeMongoDatabase ?? 'admin', ''))
              }
            >
              <Terminal className="mr-2 size-3.5" />
              Aggregation
            </DropdownMenuItem>
          </>
        )}

        {conn.kind === 'redis' && (
          <>
            <DropdownMenuItem onClick={() => activate(conn.id, openRedisQueryTab)}>
              <Terminal className="mr-2 size-3.5" />
              Query
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => activate(conn.id, openRedisTab)}>
              <BarChart3 className="mr-2 size-3.5" />
              Stats
            </DropdownMenuItem>
          </>
        )}

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
