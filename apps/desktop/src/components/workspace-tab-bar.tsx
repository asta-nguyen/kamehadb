import { useConnections } from '@/hooks/use-connections';
import { DbIcon } from '@/components/db-icon';
import { Button } from '@/components/ui/button';
import {
  appStore,
  closeTab,
  openGraphTab,
  openMongoQueryTab,
  openNewQueryTab,
  openRedisQueryTab,
  reorderTabs,
} from '@/store';
import { isSqlKind } from '@/lib/constants';
import { useStore } from '@tanstack/react-store';
import { Activity, BarChart3, Box, Database, History, Plus, Search, Share2, Table2, Terminal, X } from 'lucide-react';
import { useRef, useState } from 'react';

function tabIcon(tabType: string) {
  if (tabType === 'query' || tabType === 'redis-query' || tabType === 'migration')
    return <Terminal className="size-3" />;
  if (
    tabType === 'graph' ||
    tabType === 'qdrant-graph' ||
    tabType === 'postgres-vector-map' ||
    tabType === 'sqlite-vec-map'
  )
    return <Share2 className="size-3" />;
  if (tabType === 'mongo' || tabType === 'mongo-query') return <Table2 className="size-3" />;
  if (tabType === 'redis') return <Box className="size-3" />;
  if (tabType === 'qdrant') return <DbIcon kind="qdrant" className="size-3" />;
  if (tabType === 'qdrant-search' || tabType === 'postgres-vector-search' || tabType === 'sqlite-vec-search')
    return <Search className="size-3" />;
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

  const dragIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  return (
    <div
      className="flex h-8 shrink-0 items-center overflow-x-auto border-b border-border bg-muted/20 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      onDragEnd={() => {
        dragIndexRef.current = null;
        setDragOverIndex(null);
      }}
    >
      {openedTabs.map((tab, index) => {
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
            draggable
            onDragStart={(e) => {
              dragIndexRef.current = index;
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', String(index));
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (dragOverIndex !== index) setDragOverIndex(index);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const from = dragIndexRef.current;
              dragIndexRef.current = null;
              setDragOverIndex(null);
              if (typeof from === 'number' && from >= 0 && from !== index) {
                reorderTabs(from, index);
              }
            }}
            className={`flex h-full shrink-0 cursor-pointer select-none items-center gap-1.5 border-r border-border px-3 text-xs transition-colors ${
              tab.id === activeTabId ? 'border-b-2 border-b-primary bg-background' : 'hover:bg-muted/50'
            } ${dragOverIndex === index ? 'border-l-2 border-l-primary' : ''}`}
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
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="ml-1 rounded-sm hover:bg-muted"
              onClick={(event) => {
                event.stopPropagation();
                closeTab(tab.id);
              }}
            >
              <X className="size-2.5" />
            </Button>
          </div>
        );
      })}

      {activeConnectionId && (
        <>
          {activeTab && (activeTab.type === 'redis-query' || activeTab.type === 'redis') ? (
            <Button
              type="button"
              variant="ghost"
              className="flex h-full shrink-0 items-center justify-center px-2 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              onClick={() => openRedisQueryTab(activeTab.connectionId)}
              title="Redis Query"
            >
              <Terminal className="size-3.5" />
            </Button>
          ) : activeTab && (activeTab.type === 'mongo-query' || activeTab.type === 'mongo') ? (
            <Button
              type="button"
              variant="ghost"
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
            </Button>
          ) : activeConnection && isSqlKind(activeConnection.kind) && activeTab ? (
            <>
              <Button
                type="button"
                variant="ghost"
                className="flex h-full shrink-0 items-center justify-center px-2 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                onClick={() => openNewQueryTab(activeTab.connectionId)}
                title="New Query"
              >
                <Plus className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="flex h-full shrink-0 items-center justify-center px-2 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                onClick={() => openGraphTab(activeTab.connectionId)}
                title="Schema Graph"
              >
                <Share2 className="size-3.5" />
              </Button>
            </>
          ) : null}
        </>
      )}

      {openedTabs.length > 0 && (
        <div
          className="flex-1 h-full min-w-2"
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
          }}
          onDrop={(e) => {
            e.preventDefault();
            const from = dragIndexRef.current;
            dragIndexRef.current = null;
            setDragOverIndex(null);
            if (typeof from === 'number' && from >= 0 && from !== openedTabs.length - 1) {
              reorderTabs(from, openedTabs.length - 1);
            }
          }}
        />
      )}
    </div>
  );
}
