import { useStore } from '@tanstack/react-store';
import { useMemo, useEffect } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { useConnections } from '@/hooks/use-connections';
import { Sidebar } from '@/components/sidebar';
import { TableView } from '@/components/table-view';
import { SqlEditor } from '@/components/sql-editor';
import { SchemaGraph } from '@/components/schema-graph';
import { MongoView } from '@/components/mongo-view';
import { RedisView } from '@/components/redis-view';
import { RedisQuery } from '@/components/redis-query';
import { MongoQuery } from '@/components/mongo-query';
import { TableStats } from '@/components/table-stats';
import { DatabaseStats } from '@/components/database-stats';
import { ApiSettingsPage } from '@/components/api-settings-page';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { AIChatPanel } from '@/components/ai-chat-panel';
import {
  appStore,
  openNewQueryTab,
  openGraphTab,
  closeTab,
  setTheme,
  applyTheme,
  openDatabaseStatsTab,
  openRedisQueryTab,
  openMongoQueryTab,
  closeAiChatPanel,
} from '@/store';
import {
  X,
  Terminal,
  Table2,
  Plus,
  Share2,
  Database,
  Sun,
  Moon,
  Monitor,
  BarChart3,
  Activity,
  Box,
} from 'lucide-react';

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
          ) : activeConnection ? (
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
    if (activeConnection?.kind === 'mongodb') {
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

  return (
    <div className="relative flex items-center bg-muted/40 rounded-md shadow-sm">
      <div
        className="absolute top-1 bottom-1 w-[calc(33.333%-4px)] bg-background rounded shadow-[inset_0_1px_1px_rgba(255,255,255,0.8),0_1px_2px_rgba(0,0,0,0.1)] transition-all duration-200 ease-out will-change-transform"
        style={{
          left: '4px',
          transform: `translateX(${theme === 'light' ? '0' : theme === 'system' ? 'calc(100% + 4px)' : 'calc(200% + 8px)'})`,
        }}
      />
      <button
        onClick={() => setTheme('light')}
        className="relative z-10 w-7 h-7 flex items-center justify-center rounded transition-colors duration-150 text-muted-foreground/50 hover:text-foreground"
        title="Light"
        aria-label="Light"
        aria-pressed={theme === 'light'}
      >
        <Sun className="size-[15px] shrink-0" />
      </button>
      <button
        onClick={() => setTheme('system')}
        className="relative z-10 w-7 h-7 flex items-center justify-center rounded transition-colors duration-150 text-muted-foreground/50 hover:text-foreground"
        title="System"
        aria-label="System"
        aria-pressed={theme === 'system'}
      >
        <Monitor className="size-[15px] shrink-0" />
      </button>
      <button
        onClick={() => setTheme('dark')}
        className="relative z-10 w-7 h-7 flex items-center justify-center rounded transition-colors duration-150 text-muted-foreground/50 hover:text-foreground"
        title="Dark"
        aria-label="Dark"
        aria-pressed={theme === 'dark'}
      >
        <Moon className="size-[15px] shrink-0" />
      </button>
    </div>
  );
}

function Header() {
  return (
    <header className="h-9 border-b border-border flex items-center justify-between px-4 shrink-0 bg-background">
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
