import { ApiSettingsPage } from '@/components/api-settings-page';
import { DatabaseStats } from '@/components/database-stats';
import { DbIcon } from '@/components/db-icon';
import { GlobalSearch } from '@/components/global-search';
import { MigrationAssistant } from '@/components/migration-assistant';
import { MongoQuery } from '@/components/mongo-query';
import { MongoView } from '@/components/mongo-view';
import { QdrantQuery } from '@/components/qdrant-query';
import { QdrantStatsPanel } from '@/components/qdrant-stats';
import { QdrantVectorMap } from '@/components/qdrant-vector-map';
import { QdrantView } from '@/components/qdrant-view';
import { RedisQuery } from '@/components/redis-query';
import { RedisView } from '@/components/redis-view';
import { SchemaGraph } from '@/components/schema-graph';
import { SchemaTimeline } from '@/components/schema-timeline';
import { Sidebar } from '@/components/sidebar';
import { SqlEditor } from '@/components/sql-editor';
import { TableStats } from '@/components/table-stats';
import { TableView } from '@/components/table-view';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AIChatPanel } from '@/components/ai-chat-panel';
import { isSqlKind, KIND_LABELS, KINDS } from '@/lib/constants';
import { useConnections } from '@/hooks/use-connections';
import {
  applyTheme,
  appStore,
  closeAllTabs,
  closeAiChatPanel,
  closeTab,
  openDatabaseStatsTab,
  openGraphTab,
  openMongoQueryTab,
  openNewQueryTab,
  openRedisQueryTab,
  setTheme,
} from '@/store';
import { api } from '@/lib/api';
import { useStore } from '@tanstack/react-store';
import {
  Activity,
  BarChart3,
  Box,
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
  History as HistoryIcon,
} from 'lucide-react';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { getGreeting } from '@/components/workspace-screen';

const THEME_OPTIONS = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'system', label: 'System', Icon: Monitor },
  { value: 'dark', label: 'Dark', Icon: Moon },
] as const;

function TabBar() {
  const openedTabs = useStore(appStore, (state) => state.openedTabs);
  const activeTabId = useStore(appStore, (state) => state.activeTabId);
  const activeConnectionId = useStore(appStore, (state) => state.activeConnectionId);
  const connectionStatus = useStore(appStore, (s) => s.connectionStatus);
  const { data: connections } = useConnections();

  const activeConnection = connections?.find((c) => c.id === activeConnectionId);
  const activeTab = openedTabs.find((t) => t.id === activeTabId);

  const getSignalColor = (connectionId: string) => {
    const st = connectionStatus[connectionId];
    if (st === 'connected' || st === 'slow') return '#22c55e';
    if (st === 'reconnecting') return '#f97316';
    if (st === 'disconnected') return '#ef4444';
    return '#6b7280';
  };

  return (
    <div className="flex items-center h-8 border-b border-border bg-muted/20 shrink-0 overflow-x-auto">
      {openedTabs.map((tab) => {
        return (
          <div
            key={tab.id}
            role="button"
            tabIndex={0}
            className={`flex items-center gap-1.5 px-3 h-full border-r border-border cursor-pointer text-xs shrink-0 select-none ${
              tab.id === activeTabId ? 'bg-background border-b-2 border-b-primary' : 'hover:bg-muted/50'
            }`}
            onClick={() =>
              appStore.setState((s) => ({ ...s, activeTabId: tab.id, activeConnectionId: tab.connectionId }))
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                appStore.setState((s) => ({ ...s, activeTabId: tab.id, activeConnectionId: tab.connectionId }));
              }
            }}
          >
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: getSignalColor(tab.connectionId) }}
            />
            {tab.type === 'query' || tab.type === 'redis-query' ? (
              <Terminal className="size-3" />
            ) : tab.type === 'graph' ? (
              <Share2 className="size-3" />
            ) : tab.type === 'mongo' || tab.type === 'mongo-query' ? (
              <Table2 className="size-3" />
            ) : tab.type === 'redis' ? (
              <Box className="size-3" />
            ) : tab.type === 'qdrant' ? (
              <DbIcon kind="qdrant" className="size-3" />
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
            ) : tab.type === 'schema-timeline' ? (
              <HistoryIcon className="size-3" />
            ) : tab.type === 'migration' ? (
              <Terminal className="size-3" />
            ) : (
              <Table2 className="size-3" />
            )}
            <span className="truncate max-w-30">{tab.title}</span>
            <button
              type="button"
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
              type="button"
              className="flex items-center justify-center h-full px-2 hover:bg-muted/50 text-muted-foreground hover:text-foreground shrink-0"
              onClick={() => openRedisQueryTab(activeConnectionId)}
              title="Redis Query"
            >
              <Terminal className="size-3.5" />
            </button>
          ) : activeTab && (activeTab.type === 'mongo-query' || activeTab.type === 'mongo') ? (
            <button
              type="button"
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
          ) : activeConnection && isSqlKind(activeConnection.kind) ? (
            <>
              <button
                type="button"
                className="flex items-center justify-center h-full px-2 hover:bg-muted/50 text-muted-foreground hover:text-foreground shrink-0"
                onClick={() => openNewQueryTab(activeConnectionId)}
                title="New Query"
              >
                <Plus className="size-3.5" />
              </button>
              <button
                type="button"
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

function WelcomePage({ greeting, prompt }: { greeting: string; prompt: string }) {
  const { data: connections } = useConnections();
  const connectionStatus = useStore(appStore, (s) => s.connectionStatus);
  const hasConnections = connections && connections.length > 0;
  const count = connections?.length ?? 0;

  // Show kinds that have at least one connection profile; fall back to all
  // KINDS when no connections exist at all.
  const displayKinds = useMemo(() => {
    if (!connections || connections.length === 0) return KINDS;
    const kindsUsed = new Set(connections.map((c) => c.kind));
    return KINDS.filter((k) => kindsUsed.has(k));
  }, [connections]);

  return (
    <div className="h-full flex flex-col items-center justify-center bg-gradient-to-b from-background via-background to-muted/30">
      <div className="text-center max-w-lg mx-auto px-6">
        {/* Greeting */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight mb-2">{greeting}</h1>
          <p className="text-sm text-muted-foreground">{prompt}</p>
        </div>

        {/* Connections quick status */}
        {hasConnections && (
          <div className="flex items-center justify-center gap-1.5 mb-6 text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-primary" />
            {count} connection{count !== 1 ? 's' : ''} configured
          </div>
        )}

        {/* Database icons — glow when at least one connection of this kind is online */}
        <div className="flex flex-wrap justify-center gap-3 mb-8">
          {displayKinds.map((kind) => {
            const isOn = connections?.some(
              (c) => c.kind === kind && (connectionStatus[c.id] === 'connected' || connectionStatus[c.id] === 'slow'),
            );
            return (
              <div
                key={kind}
                className={`relative flex flex-col items-center gap-1.5 p-3 rounded-lg border min-w-[72px] transition-all ${
                  isOn
                    ? 'bg-muted/50 border-emerald-500/30 shadow-[0_0_12px_-2px_rgba(34,197,94,0.4)]'
                    : 'bg-muted/10 border-red-500/20 opacity-50 shadow-[0_0_8px_-2px_rgba(239,68,68,0.2)]'
                }`}
              >
                <span className="flex size-8 items-center justify-center rounded-full bg-background/60">
                  <DbIcon kind={kind} className="size-5" />
                </span>
                <span className="text-[11px] text-muted-foreground/70 font-medium">{KIND_LABELS[kind] ?? kind}</span>
              </div>
            );
          })}
        </div>

        {!hasConnections && <p className="text-xs text-muted-foreground/60 mb-6">{KINDS.length} databases supported</p>}

        {/* Keyboard shortcuts hint */}
        <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground/50">
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted font-mono text-[10px]">⌘K</kbd>
            Quick search
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted font-mono text-[10px]">⌘N</kbd>
            New query
          </span>
        </div>
      </div>
    </div>
  );
}

function Workspace() {
  const activeConnectionId = useStore(appStore, (state) => state.activeConnectionId);
  const openedTabs = useStore(appStore, (state) => state.openedTabs);
  const activeTabId = useStore(appStore, (state) => state.activeTabId);
  const { data: connections } = useConnections();

  const activeConnection = connections?.find((c) => c.id === activeConnectionId);
  const greetingLine = useMemo(() => getGreeting(), []);

  if (!activeConnectionId || !activeConnection) {
    return <WelcomePage greeting={greetingLine[0]} prompt={greetingLine[1]} />;
  }

  const visibleTabs = openedTabs;

  if (visibleTabs.length === 0) {
    if (activeConnection.kind === 'mongodb' || activeConnection.kind === 'qdrant') {
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
            {isSqlKind(activeConnection.kind) && (
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

  // Render all opened tabs but hide inactive ones (except qdrant-graph which
  // has a Three.js render loop that wastes GPU when invisible).
  // Use invisible+absolute instead of display:none (hidden) because
  // Monaco editor crashes with "Cannot read properties of null (reading 'finalW')"
  // when it cannot measure layout in a zero-size container.
  return (
    <div className="relative h-full flex flex-col">
      {openedTabs.map((tab) => (
        <div
          key={tab.id}
          className={
            tab.type === 'qdrant-graph'
              ? tab.id !== activeTab.id
                ? 'hidden'
                : 'flex-1 flex flex-col min-h-0'
              : tab.id !== activeTab.id
                ? 'invisible absolute inset-0 overflow-hidden'
                : 'flex-1 flex flex-col min-h-0'
          }
        >
          {tab.type === 'query' && <SqlEditor tab={tab} connectionId={tab.connectionId} />}
          {tab.type === 'table' && <TableView connectionId={tab.connectionId} tableId={tab.title} />}
          {tab.type === 'graph' && <SchemaGraph connectionId={tab.connectionId} />}
          {tab.type === 'mongo' && <MongoView tab={tab} connectionId={tab.connectionId} />}
          {tab.type === 'mongo-query' && <MongoQuery tab={tab} connectionId={tab.connectionId} />}
          {tab.type === 'redis' && <RedisView connectionId={tab.connectionId} />}
          {tab.type === 'redis-query' && <RedisQuery tab={tab} connectionId={tab.connectionId} />}
          {tab.type === 'qdrant' && (
            <QdrantView connectionId={tab.connectionId} collection={'collection' in tab ? tab.collection : ''} />
          )}
          {tab.type === 'qdrant-search' && <QdrantQuery tab={tab} connectionId={tab.connectionId} />}
          {tab.type === 'qdrant-graph' && tab.id === activeTab.id && (
            <Suspense
              fallback={
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                  Loading map…
                </div>
              }
            >
              <QdrantVectorMap
                tab={tab}
                connectionId={tab.connectionId}
                collection={'collection' in tab ? tab.collection : ''}
              />
            </Suspense>
          )}
          {tab.type === 'qdrant-stats' && (
            <Suspense>
              <QdrantStatsPanel
                connectionId={tab.connectionId}
                collection={'collection' in tab ? tab.collection : ''}
              />
            </Suspense>
          )}
          {tab.type === 'database-stats' && <DatabaseStats connectionId={tab.connectionId} />}
          {tab.type === 'schema-timeline' && <SchemaTimeline connectionId={tab.connectionId} />}
          {tab.type === 'migration' && <MigrationAssistant connectionId={tab.connectionId} />}
          {tab.type === 'table-stats' && 'tableId' in tab && (
            <TableStats connectionId={tab.connectionId} tableId={tab.tableId} />
          )}
        </div>
      ))}
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
  const activeIndex = Math.max(
    THEME_OPTIONS.findIndex((option) => option.value === theme),
    0,
  );

  return (
    <div className="relative grid grid-cols-[repeat(3,1.75rem)] items-center gap-0.5 rounded-md bg-muted/40 p-0.5 shadow-sm">
      <div
        className="pointer-events-none absolute left-0.5 top-0.5 h-7 w-7 rounded bg-background shadow-[inset_0_1px_1px_rgba(255,255,255,0.8),0_1px_2px_rgba(0,0,0,0.1)] transition-transform duration-200 ease-out will-change-transform"
        style={{ transform: `translateX(${activeIndex * 1.875}rem)` }}
      />
      {THEME_OPTIONS.map(({ value, label, Icon }) => (
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

function Header({ onSearchOpen }: { readonly onSearchOpen: () => void }) {
  return (
    <header className="flex h-10 shrink-0 items-center justify-between border-b border-border bg-background px-4">
      <div className="flex items-center gap-3">
        <img alt="kamehadb" className="h-5 w-5 rounded object-contain" src="/logo.png" />
        <div className="flex items-baseline">
          <span className="font-mono text-sm font-bold tracking-widest text-foreground/90">KAME</span>
          <span className="font-mono text-sm font-black tracking-widest text-foreground">HA</span>
          <span className="ml-0.5 font-mono text-sm font-bold tracking-widest text-primary">DB</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onSearchOpen} className="gap-1.5 text-xs text-muted-foreground/60">
          <Search className="size-3.5" />
          <span className="hidden sm:inline">Search</span>
          <kbd className="ml-1 hidden items-center gap-0.5 rounded bg-muted/60 px-1 py-0.5 font-mono text-[10px] font-normal text-muted-foreground/50 sm:inline-flex">
            <span>⌘</span>K
          </kbd>
        </Button>
        <ThemeToggle />
      </div>
    </header>
  );
}

function App() {
  const view = useStore(appStore, (state) => state.view);
  const theme = useStore(appStore, (state) => state.theme);
  const openedTabs = useStore(appStore, (state) => state.openedTabs);
  const closeAllChordUntilRef = useRef(0);

  // Kill orphaned mongo-shell PTY sessions when their tabs are closed.
  // Lives in App() (always mounted) rather than Workspace() (unmounted when
  // ApiSettingsPage is active) so cleanup still fires after cross-view tab close.
  const prevShellTabsRef = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    const prev = prevShellTabsRef.current;
    const current = new Map<string, string>();
    for (const t of openedTabs) {
      if (t.type === 'mongo-shell' && t.sessionId) {
        current.set(t.id, t.sessionId);
      }
    }
    for (const [tabId, sessionId] of prev) {
      if (!current.has(tabId)) {
        api.stopMongoShell(sessionId).catch(() => {});
      }
    }
    prevShellTabsRef.current = current;
  }, [openedTabs]);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    applyTheme(theme);
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event: MediaQueryListEvent) => {
      if (appStore.state.theme === 'system') {
        document.documentElement.classList.toggle('dark', event.matches);
      }
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
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
        setSearchOpen(true);
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

      if (key !== 'shift') closeAllChordUntilRef.current = 0;
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <TooltipProvider>
      <Toaster />
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
      <div className="flex h-screen w-screen flex-col">
        <Header onSearchOpen={() => setSearchOpen(true)} />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          {view === 'api-settings' ? <ApiSettingsPage /> : <MainLayout />}
        </div>
      </div>
    </TooltipProvider>
  );
}

export default App;
