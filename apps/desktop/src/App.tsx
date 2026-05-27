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
  toggleTheme,
  applyTheme,
  openDatabaseStatsTab,
  openRedisTab,
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
  const { data: connections } = useConnections();

  // Memoize color lookup map to avoid O(n) find on every render
  const connectionColorMap = useMemo(() => {
    if (!connections) return new Map<string, string>();
    return new Map(connections.map((c) => [c.id, c.color ?? '']));
  }, [connections]);

  return (
    <div className="flex items-center h-8 border-b border-border bg-muted/20 shrink-0 overflow-x-auto">
      {openedTabs.map((tab) => {
        const connColor = connectionColorMap.get(tab.connectionId) || null;
        return (
          <div
            key={tab.id}
            className={`flex items-center gap-1.5 px-3 h-full border-r border-border cursor-pointer text-xs shrink-0 select-none ${
              tab.id === activeTabId ? 'bg-background border-b-2 border-b-primary' : 'hover:bg-muted/50'
            }`}
            onClick={() => appStore.setState((s) => ({ ...s, activeTabId: tab.id }))}
          >
            {connColor && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: connColor }} />}
            {tab.type === 'query' ? (
              <Terminal className="size-3" />
            ) : tab.type === 'graph' ? (
              <Share2 className="size-3" />
            ) : tab.type === 'mongo' ? (
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
        <button
          className="flex items-center justify-center h-full px-2 hover:bg-muted/50 text-muted-foreground hover:text-foreground shrink-0"
          onClick={() => openNewQueryTab(activeConnectionId)}
          title="New Query"
        >
          <Plus className="size-3.5" />
        </button>
      )}
      {activeConnectionId && (
        <button
          className="flex items-center justify-center h-full px-2 hover:bg-muted/50 text-muted-foreground hover:text-foreground shrink-0"
          onClick={() => openGraphTab(activeConnectionId)}
          title="Schema Graph"
        >
          <Share2 className="size-3.5" />
        </button>
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

  // Auto-open appropriate view for connection type when no matching tabs open
  useEffect(() => {
    if (!activeConnectionId || !activeConnection) return;

    const hasMatchingTab = openedTabs.some((tab) => {
      if (activeConnection.kind === 'redis') return tab.type === 'redis';
      if (activeConnection.kind === 'mongodb') return tab.type === 'mongo';
      return ['query', 'table', 'graph', 'database-stats', 'table-stats'].includes(tab.type);
    });

    if (!hasMatchingTab) {
      if (activeConnection.kind === 'redis') {
        openRedisTab(activeConnectionId);
      }
    }
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

  // Filter tabs to only show tabs matching current connection type
  const visibleTabs = openedTabs.filter((tab) => {
    if (!activeConnection) return false;
    switch (activeConnection.kind) {
      case 'redis':
        return tab.type === 'redis';
      case 'mongodb':
        return tab.type === 'mongo';
      default:
        return ['query', 'table', 'graph', 'database-stats', 'table-stats'].includes(tab.type);
    }
  });

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
      {activeTab.type === 'redis' && <RedisView connectionId={activeTab.connectionId} />}
      {activeTab.type === 'database-stats' && <DatabaseStats connectionId={activeTab.connectionId} />}
      {activeTab.type === 'table-stats' && 'tableId' in activeTab && (
        <TableStats connectionId={activeTab.connectionId} tableId={activeTab.tableId} />
      )}
    </div>
  );
}

function MainLayout() {
  const activeConnectionId = useStore(appStore, (state) => state.activeConnectionId);

  return (
    <div className="flex-1 flex overflow-hidden">
      <main className="flex-1 bg-background flex flex-col overflow-hidden">
        <TabBar />
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 overflow-hidden">
            <Workspace />
          </div>
          <AIChatPanel connectionId={activeConnectionId} />
        </div>
      </main>
    </div>
  );
}

function ThemeToggle() {
  const theme = useStore(appStore, (state) => state.theme);

  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;
  const label = theme === 'light' ? 'Light mode' : theme === 'dark' ? 'Dark mode' : 'System theme';

  return (
    <button
      onClick={toggleTheme}
      className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
      title={label}
    >
      <Icon className="size-4" />
    </button>
  );
}

function Header() {
  return (
    <header className="h-9 border-b border-border flex items-center justify-between px-4 shrink-0 bg-background">
      <span className="font-semibold text-sm">kamehadb</span>
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
