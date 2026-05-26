import { useStore } from '@tanstack/react-store';
import { useMemo, useEffect } from 'react';
import { useConnections } from '@/hooks/use-connections';
import { Sidebar } from '@/components/sidebar';
import { TableView } from '@/components/table-view';
import { SqlEditor } from '@/components/sql-editor';
import { SchemaGraph } from '@/components/schema-graph';
import { MongoView } from '@/components/mongo-view';
import { ApiSettingsPage } from '@/components/api-settings-page';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { AIChatPanel } from '@/components/ai-chat-panel';
import { appStore, openNewQueryTab, openGraphTab, closeTab, toggleTheme, applyTheme } from '@/store';
import { X, Terminal, Table2, Plus, Share2, Database, Sun, Moon, Monitor } from 'lucide-react';

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

  if (openedTabs.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-sm text-muted-foreground">Select a table or open a query tab</p>
          <div className="flex items-center justify-center gap-2">
            <Button size="sm" variant="outline" onClick={() => openNewQueryTab(activeConnectionId)}>
              <Terminal className="size-3.5 mr-1.5" />
              New Query
            </Button>
            <Button size="sm" variant="outline" onClick={() => openGraphTab(activeConnectionId)}>
              <Share2 className="size-3.5 mr-1.5" />
              Schema Graph
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const activeTab = openedTabs.find((t) => t.id === activeTabId) ?? openedTabs[0];

  return (
    <div className="h-full flex flex-col">
      {activeTab.type === 'query' && <SqlEditor key={activeTab.id} tab={activeTab} connectionId={activeConnectionId} />}
      {activeTab.type === 'table' && <TableView connectionId={activeConnectionId} tableId={activeTab.title} />}
      {activeTab.type === 'graph' && <SchemaGraph connectionId={activeConnectionId} />}
      {activeTab.type === 'mongo' && <MongoView tab={activeTab} connectionId={activeConnectionId} />}
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
      <div className="h-screen w-screen flex flex-col">
        <Header />
        <div className="flex-1 flex overflow-hidden">
          <aside className="w-56 border-r border-border shrink-0 flex flex-col bg-muted/30">
            <Sidebar />
          </aside>
          {view === 'api-settings' ? <ApiSettingsPage /> : <MainLayout />}
        </div>
      </div>
    </TooltipProvider>
  );
}

export default App;
