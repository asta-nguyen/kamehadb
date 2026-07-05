import { Button } from '@/components/ui/button';
import { AIChatPanel } from '@/components/ai-chat-panel';
import { DbIcon } from '@/components/db-icon';
import { WorkspaceContent } from '@/components/workspace-content';
import { WorkspaceTabBar } from '@/components/workspace-tab-bar';
import { useConnections } from '@/hooks/use-connections';
import { GREETINGS, KIND_LABELS, KINDS, PROMPTS } from '@/lib/constants';
import { isSqlKind } from '@/lib/constants';
import { appStore, closeAiChatPanel, openDatabaseStatsTab, openGraphTab, openNewQueryTab } from '@/store';
import { useStore } from '@tanstack/react-store';
import { BarChart3, Share2, Terminal } from 'lucide-react';
import { useEffect, useMemo } from 'react';

function pick<T>(items: readonly T[], last?: T): T {
  if (items.length === 0) throw new Error('pick: items must not be empty');
  const filtered = last !== undefined ? items.filter((item) => item !== last) : [...items];
  const pool = filtered.length > 0 ? filtered : items;
  return pool[Math.floor(Math.random() * pool.length)];
}

function getGreeting(): [string, string] {
  const lastGreeting = localStorage.getItem('lastGreeting') ?? undefined;
  const greeting = pick(GREETINGS, lastGreeting);
  localStorage.setItem('lastGreeting', greeting);
  const returning = localStorage.getItem('kamehadb_visits');
  const prompt = returning ? pick(PROMPTS) : 'Create or select a connection to get started';
  if (!returning) localStorage.setItem('kamehadb_visits', '1');
  return [greeting, prompt];
}

function WelcomePage({ greeting, prompt }: { readonly greeting: string; readonly prompt: string }) {
  const { data: connections } = useConnections();
  const connectionStatus = useStore(appStore, (state) => state.connectionStatus);
  const hasConnections = connections !== undefined && connections.length > 0;
  const displayKinds = useMemo(() => {
    if (!connections || connections.length === 0) return KINDS;
    const kindsUsed = new Set(connections.map((connection) => connection.kind));
    return KINDS.filter((kind) => kindsUsed.has(kind));
  }, [connections]);

  return (
    <div className="h-full flex flex-col items-center justify-center bg-gradient-to-b from-background via-background to-muted/30">
      <div className="mx-auto max-w-lg px-6 text-center">
        <div className="mb-8">
          <h1 className="mb-2 text-2xl font-semibold tracking-tight">{greeting}</h1>
          <p className="text-sm text-muted-foreground">{prompt}</p>
        </div>
        {hasConnections && (
          <div className="mb-6 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-primary" />
            {connections.length} connection{connections.length !== 1 ? 's' : ''} configured
          </div>
        )}
        <div className="mb-8 flex flex-wrap justify-center gap-3">
          {displayKinds.map((kind) => {
            const connected = connections?.some(
              (connection) =>
                connection.kind === kind &&
                (connectionStatus[connection.id] === 'connected' || connectionStatus[connection.id] === 'slow'),
            );
            return (
              <div
                key={kind}
                className={`relative flex min-w-[72px] flex-col items-center gap-1.5 rounded-lg border p-3 transition-all ${connected ? 'border-emerald-500/30 bg-muted/50 shadow-[0_0_12px_-2px_rgba(34,197,94,0.4)]' : 'border-red-500/20 bg-muted/10 opacity-50 shadow-[0_0_8px_-2px_rgba(239,68,68,0.2)]'}`}
              >
                <span className="flex size-8 items-center justify-center rounded-full bg-background/60">
                  <DbIcon kind={kind} className="size-5" />
                </span>
                <span className="text-[11px] font-medium text-muted-foreground/70">{KIND_LABELS[kind] ?? kind}</span>
              </div>
            );
          })}
        </div>
        {!hasConnections && <p className="mb-6 text-xs text-muted-foreground/60">{KINDS.length} databases supported</p>}
      </div>
    </div>
  );
}

function Workspace() {
  const activeConnectionId = useStore(appStore, (state) => state.activeConnectionId);
  const openedTabs = useStore(appStore, (state) => state.openedTabs);
  const activeTabId = useStore(appStore, (state) => state.activeTabId);
  const { data: connections } = useConnections();
  const activeConnection = connections?.find((connection) => connection.id === activeConnectionId);
  const greeting = useMemo(() => getGreeting(), []);
  const activeTab = openedTabs.find((tab) => tab.id === activeTabId) ?? openedTabs[0];

  // Keep hook order stable by validating the active tab before any early return.
  // The guard prevents a mid-render store mutation when tabs are restored asynchronously.
  useEffect(() => {
    if (!activeTab || openedTabs.length === 0) return;
    if (!openedTabs.find((tab) => tab.id === activeTabId)) {
      appStore.setState((state) => ({ ...state, activeTabId: activeTab.id }));
    }
  }, [activeTab, activeTabId, openedTabs]);

  if (!activeConnectionId || !activeConnection) return <WelcomePage greeting={greeting[0]} prompt={greeting[1]} />;
  if (openedTabs.length === 0) {
    if (activeConnection.kind === 'mongodb' || activeConnection.kind === 'qdrant') {
      return (
        <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
          Select a collection from the sidebar
        </div>
      );
    }

    return (
      <div className="h-full flex items-center justify-center">
        <div className="space-y-3 text-center">
          <p className="text-sm text-muted-foreground">Select a table or open a tab</p>
          {isSqlKind(activeConnection.kind) && (
            <div className="flex items-center justify-center gap-2">
              <Button size="sm" variant="outline" onClick={() => openNewQueryTab(activeConnectionId)}>
                <Terminal className="mr-1.5 size-3.5" />
                New Query
              </Button>
              <Button size="sm" variant="outline" onClick={() => openGraphTab(activeConnectionId)}>
                <Share2 className="mr-1.5 size-3.5" />
                Schema Graph
              </Button>
              <Button size="sm" variant="outline" onClick={() => openDatabaseStatsTab(activeConnectionId)}>
                <BarChart3 className="mr-1.5 size-3.5" />
                Database Stats
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }
  if (!activeTab)
    return <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Loading...</div>;

  return (
    <div className="h-full">
      {openedTabs.map(
        (tab) =>
          tab.id === activeTab.id && (
            <div key={tab.id} className="h-full">
              <WorkspaceContent activeTab={tab} />
            </div>
          ),
      )}
    </div>
  );
}

export function MainLayout() {
  const aiPanelConnectionId = useStore(appStore, (state) => state.aiPanelConnectionId);

  return (
    <div className="flex flex-1 overflow-hidden">
      <main className="flex flex-1 flex-col overflow-hidden bg-background">
        <WorkspaceTabBar />
        <div className="flex-1 overflow-hidden">
          <Workspace />
        </div>
      </main>
      {aiPanelConnectionId && <AIChatPanel connectionId={aiPanelConnectionId} onClose={closeAiChatPanel} />}
    </div>
  );
}
