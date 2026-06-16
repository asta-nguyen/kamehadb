import type { ConnectionProfile } from '@kamehadb/shared';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { isSqlKind } from '@/lib/constants';
import {
  appStore,
  openDatabaseStatsTab,
  openGraphTab,
  openMigrationTab,
  openMongoQueryTab,
  openNewQueryTab,
  openQdrantSearchTab,
  openRedisQueryTab,
  openRedisTab,
  openSchemaTimelineTab,
  setActiveConnection,
} from '@/store';
import { BarChart3, Bot, History, Search, Share2, Terminal } from 'lucide-react';

export function ConnectionToolMenuItems({ conn }: { readonly conn: ConnectionProfile }) {
  if (isSqlKind(conn.kind)) {
    return (
      <>
        <DropdownMenuItem
          onClick={() => {
            setActiveConnection(conn.id);
            openNewQueryTab(conn.id);
          }}
        >
          <Terminal className="mr-2 size-3.5" />
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
          <Bot className="mr-2 size-3.5" />
          Migration Assistant
        </DropdownMenuItem>
      </>
    );
  }

  if (conn.kind === 'qdrant') {
    return (
      <DropdownMenuItem
        onClick={() => {
          setActiveConnection(conn.id);
          openQdrantSearchTab(conn.id);
        }}
      >
        <Search className="mr-2 size-3.5" />
        Vector Search
      </DropdownMenuItem>
    );
  }

  if (conn.kind === 'mongodb') {
    return (
      <DropdownMenuItem
        onClick={() => {
          const database = appStore.state.activeMongoDatabase;
          setActiveConnection(conn.id);
          openMongoQueryTab(conn.id, database ?? 'admin', '');
        }}
      >
        <Terminal className="mr-2 size-3.5" />
        Aggregation
      </DropdownMenuItem>
    );
  }

  if (conn.kind === 'redis') {
    return (
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
    );
  }

  return null;
}
