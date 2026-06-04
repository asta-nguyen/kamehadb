import { MongoView } from '@/components/mongo-view';
import { RedisView } from '@/components/redis-view';
import { QdrantView } from '@/components/qdrant-view';
import { MongoQuery } from '@/components/mongo-query';
import { RedisQuery } from '@/components/redis-query';
import { QdrantQuery } from '@/components/qdrant-query';
import { SchemaGraph } from '@/components/schema-graph';
import { Sidebar } from '@/components/sidebar';
import { SqlEditor } from '@/components/sql-editor';
import { TableStats } from '@/components/table-stats';
import { TableView } from '@/components/table-view';
import { DatabaseStats } from '@/components/database-stats';
import { AIChatPanel } from '@/components/ai-chat-panel';
import { ApiSettingsPage } from '@/components/api-settings-page';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useConnections } from '@/hooks/use-connections';
import {
  appStore,
  applyTheme,
  closeAiChatPanel,
  closeAllTabs,
  closeTab,
  openDatabaseStatsTab,
  openGraphTab,
  openMongoQueryTab,
  openNewQueryTab,
  openRedisQueryTab,
  setTheme,
} from '@/store';
import { useStore } from '@tanstack/react-store';
import {
  Activity,
  BarChart3,
  Box,
  Boxes,
  Database,
  Monitor,
  Moon,
  Plus,
  Search,
  Share2,
  Sun,
  Table2,
  Terminal,
  X,
} from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useRef } from 'react';

const QdrantVectorMap = lazy(() =>
  import('@/components/qdrant-vector-map').then((m) => ({ default: m.QdrantVectorMap })),
);
const QdrantStatsPanel = lazy(() => import('@/components/qdrant-stats').then((m) => ({ default: m.QdrantStatsPanel })));

function TabBar() {
  const openedTabs = useStore(appStore, (state) => state.openedTabs);
  const activeTabId = useStore(appStore, (state) => state.activeTabId);
  const activeConnectionId = useStore(appStore, (state) => state.activeConnectionId);
  const { data: connections, isLoading } = useConnections();

  const activeConnection = connections?.find((c) => c.id === activeConnectionId);
  const activeTab = openedTabs.find((t) => t.id === activeTabId);

  const visibleTabs = activeConnectionId && (activeConnection || isLoading) ? openedTabs : [];

  const connectionColorMap = useMemo(() => {
    if (!connections) return new Map<string, string>();
    return new Map(connections.map((c) => [c.id, c.color ?? '']));
  }, [connections]);

  return (
    <div className="flex items-center h-8 border-b border-border bg-muted/20 shrink-0 overflow-x-auto">
      {visibleTabs.map((tab) => {
        const connColor = connectionColorMap.get(tab.connectionId) || null;
        return (
          <div
            key={tab.id}
            className={`flex items-center gap-1.5 px-3 h-full border-r border-border cursor-pointer text-xs shrink-0 select-none ${
              tab.id === activeTabId ? 'bg-background border-b-2 border-b-primary' : 'hover:bg-muted/50'
            }`}
            onClick={() =>
              appStore.setState((s) => ({ ...s, activeTabId: tab.id, activeConnectionId: tab.connectionId }))
            }
          >
            {connColor && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: connColor }} />}
            {tab.type === 'query' || tab.type === 'redis-query' ? (
              <Terminal className="size-3" />
            ) : tab.type === 'graph' ? (
              <Share2 className="size-3" />
            ) : tab.type === 'mongo' || tab.type === 'mongo-query' ? (
              <Database className="size-3" />
            ) : tab.type === 'redis' ? (
              <Box className="size-3" />
            ) : tab.type === 'qdrant' ? (
              <Boxes className="size-3" />
            ) : tab.type === 'qdrant-search' ? (
              <Search className="size-3" />
            ) : tab.type === 'qdrant-graph' ? (
              <Share2 className="size-3" />
            ) : tab.type === 'qdrant-stats' ? (
              <BarChart3 className="size-3" />
            ) : tab.type === 'stats' || tab.type === 'database-stats' ? (
              <BarChart3 className="size-3" />
            ) : tab.type === 'table-stats' ? (
              <Activity className="size-3" />
            ) : (
              <Table2 className="size-3" />
            )}
            <span className="truncate max-w-30">{tab.title}</span>
            <button
              className="ml-1 hover:bg-muted rounded-sm p-0.5"
              onClick={(e) => {
                e.stopPropagation();
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
              className="flex items-center justify-center h-full px-2 hover:bg-muted/50 text-muted-foreground hover:text-foreground shrink-0"
              onClick={() => openRedisQueryTab(activeConnectionId)}
              title="Redis Query"
            >
              <Terminal className="size-3.5" />
            </button>
          ) : activeTab && (activeTab.type === 'mongo-query' || activeTab.type === 'mongo') ? (
            <button
              className="flex items-center justify-center h-full px-2 hover:bg-muted/50 text-muted-foreground hover:text-foreground shrink-0"
              onClick={() => {
                const mongoDb = appStore.state.activeMongoDatabase;
                const database = 'database' in activeTab ? activeTab.database : (mongoDb ?? 'admin');
                const collection = 'collection' in activeTab ? activeTab.collection : '';
                openMongoQueryTab(activeConnectionId, database, collection);
              }}
              title="New Aggregation"
            >
              <Database className="size-3.5" />
            </button>
          ) : activeConnection &&
            (activeConnection.kind === 'postgres' ||
              activeConnection.kind === 'mysql' ||
              activeConnection.kind === 'sqlite') ? (
            <>
              <button
                className="flex items-center justify-center h-full px-2 hover:bg-muted/50 text-muted-foreground hover:text-foreground shrink-0"
                onClick={() => openNewQueryTab(activeConnectionId)}
                title="New Query"
              >
                <Plus className="size-3.5" />
              </button>
              <button
                className="flex items-center justify-center h-full px-2 hover:bg-muted/50 text-muted-foreground hover:text-foreground shrink-0"
                onClick={() => openGraphTab(activeConnectionId)}
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

function Workspace() {
  const activeConnectionId = useStore(appStore, (state) => state.activeConnectionId);
  const openedTabs = useStore(appStore, (state) => state.openedTabs);
  const activeTabId = useStore(appStore, (state) => state.activeTabId);
  const { data: connections } = useConnections();

  const activeConnection = connections?.find((c) => c.id === activeConnectionId);

  // Auto-open appropriate view for connection type when no tabs open
  useEffect(() => {
    if (!activeConnectionId || !activeConnection || openedTabs.length > 0) return;

    // No tabs - show default empty state (user can click Stats from sidebar)
    return;
  }, [activeConnectionId, activeConnection?.kind, openedTabs]);

  if (!activeConnectionId) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-base font-medium mb-1">Welcome to kamehadb</h2>
          <p className="text-sm text-muted-foreground">Create or select a connection to get started</p>
        </div>
      </div>
    );
  }

  const visibleTabs = openedTabs;

  if (visibleTabs.length === 0) {
    if (activeConnection?.kind === 'mongodb' || activeConnection?.kind === 'qdrant') {
      return (
        <div className="h-full flex items-center justify-center">
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Select a collection from the sidebar</p>
          </div>
        </div>
      );
    }

    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-sm text-muted-foreground">Select a table or open a tab</p>
          <div className="flex items-center justify-center gap-2">
            {(activeConnection?.kind === 'postgres' ||
              activeConnection?.kind === 'mysql' ||
              activeConnection?.kind === 'sqlite') && (
              <>
                <Button size="sm" variant="outline" onClick={() => openNewQueryTab(activeConnectionId)}>
                  <Terminal className="size-3.5 mr-1.5" />
                  New Query
                </Button>
                <Button size="sm" variant="outline" onClick={() => openGraphTab(activeConnectionId)}>
                  <Share2 className="size-3.5 mr-1.5" />
                  Schema Graph
                </Button>
                <Button size="sm" variant="outline" onClick={() => openDatabaseStatsTab(activeConnectionId)}>
                  <BarChart3 className="size-3.5 mr-1.5" />
                  Database Stats
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  const foundTab = visibleTabs.find((t) => t.id === activeTabId);
  if (!foundTab && visibleTabs.length > 0) {
    appStore.setState((s) => ({ ...s, activeTabId: visibleTabs[0].id }));
  }
  const activeTab = foundTab ?? visibleTabs[0];

  if (!activeTab) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {activeTab.type === 'query' && (
        <SqlEditor key={activeTab.id} tab={activeTab} connectionId={activeTab.connectionId} />
      )}
      {activeTab.type === 'table' && <TableView connectionId={activeTab.connectionId} tableId={activeTab.title} />}
      {activeTab.type === 'graph' && <SchemaGraph connectionId={activeTab.connectionId} />}
      {activeTab.type === 'mongo' && <MongoView tab={activeTab} connectionId={activeTab.connectionId} />}
      {activeTab.type === 'mongo-query' && <MongoQuery tab={activeTab} connectionId={activeTab.connectionId} />}
      {activeTab.type === 'redis' && <RedisView connectionId={activeTab.connectionId} />}
      {activeTab.type === 'redis-query' && <RedisQuery tab={activeTab} connectionId={activeTab.connectionId} />}
      {activeTab.type === 'qdrant' && (
        <QdrantView connectionId={activeTab.connectionId} collection={activeTab.collection} />
      )}
      {activeTab.type === 'qdrant-search' && <QdrantQuery tab={activeTab} connectionId={activeTab.connectionId} />}
      {activeTab.type === 'qdrant-graph' && (
        <Suspense
          fallback={
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Loading map…</div>
          }
        >
          <QdrantVectorMap connectionId={activeTab.connectionId} collection={activeTab.collection} />
        </Suspense>
      )}
      {activeTab.type === 'qdrant-stats' && (
        <Suspense>
          <QdrantStatsPanel connectionId={activeTab.connectionId} collection={activeTab.collection} />
        </Suspense>
      )}
      {activeTab.type === 'database-stats' && <DatabaseStats connectionId={activeTab.connectionId} />}
      {activeTab.type === 'table-stats' && 'tableId' in activeTab && (
        <TableStats connectionId={activeTab.connectionId} tableId={activeTab.tableId} />
      )}
    </div>
  );
}

function MainLayout() {
  const aiPanelConnectionId = useStore(appStore, (state) => state.aiPanelConnectionId);

  return (
    <div className="flex-1 flex overflow-hidden">
      <main className="flex-1 bg-background flex flex-col overflow-hidden">
        <TabBar />
        <div className="flex-1 overflow-hidden">
          <Workspace />
        </div>
      </main>
      {aiPanelConnectionId && <AIChatPanel connectionId={aiPanelConnectionId} onClose={closeAiChatPanel} />}
    </div>
  );
}

function ThemeToggle() {
  const theme = useStore(appStore, (state) => state.theme);
  const themeOptions = [
    { value: 'light', label: 'Light', Icon: Sun },
    { value: 'system', label: 'System', Icon: Monitor },
    { value: 'dark', label: 'Dark', Icon: Moon },
  ] as const;
  const activeIndex = Math.max(
    themeOptions.findIndex((option) => option.value === theme),
    0,
  );

  return (
    <div className="relative grid grid-cols-[repeat(3,1.75rem)] items-center gap-0.5 rounded-md bg-muted/40 p-0.5 shadow-sm">
      <div
        className="pointer-events-none absolute left-0.5 top-0.5 h-7 w-7 rounded bg-background shadow-[inset_0_1px_1px_rgba(255,255,255,0.8),0_1px_2px_rgba(0,0,0,0.1)] transition-transform duration-200 ease-out will-change-transform"
        style={{
          transform: `translateX(${activeIndex * 1.875}rem)`,
        }}
      />
      {themeOptions.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          onClick={() => setTheme(value)}
          className={`relative z-10 flex size-7 items-center justify-center rounded transition-colors duration-150 ${
            theme === value ? 'text-foreground' : 'text-muted-foreground/60 hover:text-foreground'
          }`}
          title={label}
          aria-label={label}
          aria-pressed={theme === value}
        >
          <Icon className="size-3.75 shrink-0" />
        </button>
      ))}
    </div>
  );
}

function Header() {
  return (
    <header className="h-10 border-b border-border flex items-center justify-between px-4 shrink-0 bg-background">
      <div className="flex items-center gap-3">
        <img alt="kamehadb" className="h-5 w-5 object-contain rounded" src="/logo.png" />
        <div className="flex items-baseline">
          <span className="font-mono text-sm font-bold tracking-widest text-foreground/90">KAME</span>
          <span className="font-mono text-sm font-black tracking-widest text-foreground">HA</span>
          <span className="font-mono text-sm font-bold tracking-widest text-primary ml-0.5">DB</span>
        </div>
      </div>
      <ThemeToggle />
    </header>
  );
}

function App() {
  const view = useStore(appStore, (state) => state.view);
  const theme = useStore(appStore, (state) => state.theme);
  const closeAllChordUntilRef = useRef(0);

  useEffect(() => {
    applyTheme(theme);

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      const currentTheme = appStore.state.theme;
      if (currentTheme === 'system') {
        document.documentElement.classList.toggle('dark', e.matches);
      }
    };
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [theme]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;

      const key = event.key.toLowerCase();
      const hasCommandModifier = event.ctrlKey || event.metaKey;
      const hasOpenTabs = appStore.state.openedTabs.length > 0;

      if (!hasOpenTabs) {
        closeAllChordUntilRef.current = 0;
        return;
      }

      if (hasCommandModifier && key === 'w' && !event.shiftKey && !event.altKey) {
        const activeTabId = appStore.state.activeTabId;
        if (!activeTabId) return;
        event.preventDefault();
        closeTab(activeTabId);
        closeAllChordUntilRef.current = 0;
        return;
      }

      if (hasCommandModifier && key === 'k' && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        closeAllChordUntilRef.current = Date.now() + 2500;
        return;
      }

      if (
        key === 'w' &&
        event.shiftKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        Date.now() <= closeAllChordUntilRef.current
      ) {
        event.preventDefault();
        closeAllTabs();
        closeAllChordUntilRef.current = 0;
        return;
      }

      if (key !== 'shift') {
        closeAllChordUntilRef.current = 0;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <TooltipProvider>
      <Toaster />
      <div className="h-screen w-screen flex flex-col">
        <Header />
        <div className="flex-1 flex overflow-hidden">
          <Sidebar />
          {view === 'api-settings' ? <ApiSettingsPage /> : <MainLayout />}
        </div>
      </div>
    </TooltipProvider>
  );
}

export default App;
