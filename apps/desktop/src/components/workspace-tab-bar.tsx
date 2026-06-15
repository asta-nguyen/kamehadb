import { useConnections } from '@/hooks/use-connections';
import { DbIcon } from '@/components/db-icon';
import { appStore, closeTab, openGraphTab, openMongoQueryTab, openNewQueryTab, openRedisQueryTab } from '@/store';
import { isSqlKind } from '@/lib/sql-kinds';
import { useStore } from '@tanstack/react-store';
import { Activity, BarChart3, Box, Database, History, Plus, Search, Share2, Table2, Terminal, X } from 'lucide-react';

function tabIcon(tabType: string) {
  if (tabType === 'query' || tabType === 'redis-query' || tabType === 'migration')
    return <Terminal className="size-3" />;
  if (tabType === 'graph' || tabType === 'qdrant-graph') return <Share2 className="size-3" />;
  if (tabType === 'mongo' || tabType === 'mongo-query') return <Table2 className="size-3" />;
  if (tabType === 'redis') return <Box className="size-3" />;
  if (tabType === 'qdrant') return <DbIcon kind="qdrant" className="size-3" />;
  if (tabType === 'qdrant-search') return <Search className="size-3" />;
  if (tabType === 'qdrant-stats' || tabType === 'stats' || tabType === 'database-stats')
    return <BarChart3 className="size-3" />;
  if (tabType === 'table-stats') return <Activity className="size-3" />;
  if (tabType === 'schema-timeline' || tabType === 'schema-diff') return <History className="size-3" />;
  return <Table2 className="size-3" />;
}

export function WorkspaceTabBar() {
  const openedTabs = useStore(appStore, (state) => state.openedTabs);
  const activeTabId = useStore(appStore, (state) => state.activeTabId);
  const activeConnectionId = useStore(appStore, (state) => state.activeConnectionId);
  const connectionStatus = useStore(appStore, (state) => state.connectionStatus);
  const { data: connections } = useConnections();
  const activeConnection = connections?.find((connection) => connection.id === activeConnectionId);
  const activeTab = openedTabs.find((tab) => tab.id === activeTabId);

  return (
    <div className="flex h-8 shrink-0 items-center overflow-x-auto border-b border-border bg-muted/20">
      {openedTabs.map((tab) => {
        const status = connectionStatus[tab.connectionId];
        const signalColor =
          status === 'connected' || status === 'slow'
            ? '#22c55e'
            : status === 'reconnecting'
              ? '#f97316'
              : status === 'disconnected'
                ? '#ef4444'
                : '#6b7280';

        return (
          <div
            key={tab.id}
            role="button"
            tabIndex={0}
            className={`flex h-full shrink-0 cursor-pointer select-none items-center gap-1.5 border-r border-border px-3 text-xs ${
              tab.id === activeTabId ? 'border-b-2 border-b-primary bg-background' : 'hover:bg-muted/50'
            }`}
            onClick={() =>
              appStore.setState((state) => ({ ...state, activeTabId: tab.id, activeConnectionId: tab.connectionId }))
            }
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                appStore.setState((state) => ({ ...state, activeTabId: tab.id, activeConnectionId: tab.connectionId }));
              }
            }}
          >
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: signalColor }} />
            {tabIcon(tab.type)}
            <span className="max-w-30 truncate">{tab.title}</span>
            <button
              type="button"
              className="ml-1 rounded-sm p-0.5 hover:bg-muted"
              onClick={(event) => {
                event.stopPropagation();
                closeTab(tab.id);
              }}
            >
              <X className="size-2.5" />
            </button>
          </div>
        );
      })}

      {activeConnectionId && (
        <>
          {activeTab && (activeTab.type === 'redis-query' || activeTab.type === 'redis') ? (
            <button
              type="button"
              className="flex h-full shrink-0 items-center justify-center px-2 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              onClick={() => openRedisQueryTab(activeTab.connectionId)}
              title="Redis Query"
            >
              <Terminal className="size-3.5" />
            </button>
          ) : activeTab && (activeTab.type === 'mongo-query' || activeTab.type === 'mongo') ? (
            <button
              type="button"
              className="flex h-full shrink-0 items-center justify-center px-2 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              onClick={() => {
                const mongoDatabase = appStore.state.activeMongoDatabase;
                const database = 'database' in activeTab ? activeTab.database : (mongoDatabase ?? 'admin');
                const collection = 'collection' in activeTab ? activeTab.collection : '';
                openMongoQueryTab(activeTab.connectionId, database, collection);
              }}
              title="New Aggregation"
            >
              <Database className="size-3.5" />
            </button>
          ) : activeConnection && isSqlKind(activeConnection.kind) && activeTab ? (
            <>
              <button
                type="button"
                className="flex h-full shrink-0 items-center justify-center px-2 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                onClick={() => openNewQueryTab(activeTab.connectionId)}
                title="New Query"
              >
                <Plus className="size-3.5" />
              </button>
              <button
                type="button"
                className="flex h-full shrink-0 items-center justify-center px-2 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                onClick={() => openGraphTab(activeTab.connectionId)}
                title="Schema Graph"
              >
                <Share2 className="size-3.5" />
              </button>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
