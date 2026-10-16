import { ApiSettingsPage } from '@/components/api-settings-page';
import { GlobalSearch } from '@/components/global-search';
import { ShortcutsDialog } from '@/components/shortcuts-dialog';
import { LogsPage } from '@/components/logs-page';
import { Sidebar } from '@/components/sidebar';
import { MainLayout } from '@/components/workspace-screen';
import { Button } from '@/components/ui/button';
import { appendFrontendLog } from '@/lib/app-logs';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { api } from '@/lib/api';
import {
  applyTheme,
  appStore,
  closeAllTabs,
  closeTab,
  navigateTo,
  openNewQueryTab,
  openAiChatPanel,
  setTheme,
} from '@/store';
import { useStore } from '@tanstack/react-store';
import { Monitor, Moon, ScrollText, Search, Settings, Sun, Keyboard } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { isSqlKind } from '@/lib/constants';
import { toast } from '@/lib/toast';
import { useConnections } from '@/hooks/use-connections';

const THEME_OPTIONS = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'system', label: 'System', Icon: Monitor },
  { value: 'dark', label: 'Dark', Icon: Moon },
] as const;

function ThemeToggle() {
  const theme = useStore(appStore, (state) => state.theme);
  const activeIndex = Math.max(
    THEME_OPTIONS.findIndex((option) => option.value === theme),
    0,
  );

  return (
    <div className="relative grid grid-cols-[repeat(3,1.5rem)] items-center gap-0.5 rounded-md bg-muted/40 p-0.5 shadow-sm">
      <div
        className="pointer-events-none absolute left-0.5 top-0.5 size-6 rounded bg-background transition-transform duration-200 ease-out will-change-transform"
        style={{ transform: `translateX(${activeIndex * 1.625}rem)` }}
      />
      {THEME_OPTIONS.map(({ value, label, Icon }) => (
        <Button
          key={value}
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setTheme(value)}
          className={`relative z-10 flex size-6 items-center justify-center rounded transition-colors duration-150 ${
            theme === value ? 'text-foreground' : 'text-muted-foreground/60 hover:text-foreground'
          }`}
          title={label}
          aria-label={label}
          aria-pressed={theme === value}
        >
          <Icon className="size-3.75 shrink-0" />
        </Button>
      ))}
    </div>
  );
}

function formatUnknownError(reason: unknown): {
  readonly message: string;
  readonly details?: string;
  readonly stack?: string;
} {
  if (reason instanceof Error) {
    return {
      message: reason.message || reason.name,
      details: reason.name,
      stack: reason.stack,
    };
  }
  if (typeof reason === 'string') {
    return { message: reason };
  }
  return {
    message: 'Unhandled promise rejection',
    details: (() => {
      try {
        return JSON.stringify(reason);
      } catch {
        return String(reason);
      }
    })(),
  };
}

function Header({
  onSearchOpen,
  onShortcutsOpen,
}: {
  readonly onSearchOpen: () => void;
  readonly onShortcutsOpen: () => void;
}) {
  return (
    <header className="flex h-10 shrink-0 items-center justify-between border-b border-border bg-background px-2">
      <div className="flex items-center gap-2">
        <img alt="kamehadb" className="h-5 w-5 rounded object-contain" src="/logo.png" />
        <span className="text-sm font-semibold tracking-tight text-foreground">
          Kameha<span className="text-xs font-bold text-primary">DB</span>
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onSearchOpen} className="gap-1.5 text-xs text-muted-foreground/60">
          <Search className="size-3.5" />
          <span className="hidden sm:inline">Search</span>
          <kbd className="ml-1 hidden items-center gap-0.5 rounded bg-muted/60 px-1 py-0.5 font-mono text-xs font-normal text-muted-foreground/50 sm:inline-flex">
            <span>⌘</span>K
          </kbd>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onShortcutsOpen}
          className="gap-1.5 text-xs text-muted-foreground/60"
          title="Keyboard shortcuts"
        >
          <Keyboard className="size-3.5" />
          <kbd className="ml-1 hidden items-center gap-0.5 rounded bg-muted/60 px-1 py-0.5 font-mono text-xs font-normal text-muted-foreground/50 sm:inline-flex">
            <span>⌘</span>/
          </kbd>
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => navigateTo('logs')}
          className="text-muted-foreground/60"
          title="Logs"
        >
          <ScrollText className="size-3.5" />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => navigateTo('api-settings')}
          className="text-muted-foreground/60"
          title="API settings"
        >
          <Settings className="size-3.5" />
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
  const connectionsRef = useRef<ReturnType<typeof useConnections>['data']>(undefined);

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
  const { data: connections } = useConnections();
  connectionsRef.current = connections;
  const [searchOpen, setSearchOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

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

  // Right-click is always our menu: suppress the webview's native menu so surfaces
  // without a custom one stay consistent. Base UI menus open on their trigger
  // before this window listener runs, so they are unaffected. (Why)
  useEffect(() => {
    const suppressNativeMenu = (event: MouseEvent) => event.preventDefault();
    window.addEventListener('contextmenu', suppressNativeMenu);
    return () => window.removeEventListener('contextmenu', suppressNativeMenu);
  }, []);

  useEffect(() => {
    appendFrontendLog({
      level: 'info',
      scope: 'app',
      message: 'Desktop UI initialized',
      url: window.location.href,
    }).catch(() => {});

    const handleError = (event: ErrorEvent) => {
      const error = event.error instanceof Error ? event.error : null;
      appendFrontendLog({
        level: 'error',
        scope: 'window.onerror',
        message: event.message || error?.message || 'Unhandled window error',
        details: event.filename && event.lineno ? `${event.filename}:${event.lineno}:${event.colno ?? 0}` : error?.name,
        stack: error?.stack,
        url: window.location.href,
      }).catch(() => {});
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const formatted = formatUnknownError(event.reason);
      appendFrontendLog({
        level: 'error',
        scope: 'window.unhandledrejection',
        message: formatted.message,
        details: formatted.details,
        stack: formatted.stack,
        url: window.location.href,
      }).catch(() => {});
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  // One-time toast to surface the Ctrl+/ shortcut
  useEffect(() => {
    if (localStorage.getItem('kamehadb:shortcuts_hint_seen')) return;
    const timer = setTimeout(() => {
      toast('Press Ctrl+/ to see all keyboard shortcuts', {
        description: 'Ctrl+K opens the command palette',
        duration: 6000,
        action: { label: 'Show', onClick: () => setShortcutsOpen(true) },
      });
      localStorage.setItem('kamehadb:shortcuts_hint_seen', '1');
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;

      const key = event.key.toLowerCase();
      const hasCommandModifier = event.ctrlKey || event.metaKey;
      const hasOpenTabs = appStore.state.openedTabs.length > 0;

      // Ctrl+K — command palette (works even with no tabs)
      if (hasCommandModifier && key === 'k' && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        setSearchOpen(true);
        return;
      }

      // Ctrl+/ — shortcuts dialog (works even with no tabs)
      if (hasCommandModifier && key === '/' && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        setShortcutsOpen(true);
        return;
      }

      // Ctrl+, — API settings
      if (hasCommandModifier && key === ',' && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        navigateTo('api-settings');
        return;
      }

      // Ctrl+L — logs
      if (hasCommandModifier && key === 'l' && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        navigateTo('logs');
        return;
      }

      // Ctrl+R — reload webview (resets all React state)
      if (hasCommandModifier && key === 'r' && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        window.location.reload();
        return;
      }

      if (!hasOpenTabs) return;

      // Ctrl+W — close active tab
      if (hasCommandModifier && key === 'w' && !event.shiftKey && !event.altKey) {
        const activeTabId = appStore.state.activeTabId;
        if (!activeTabId) return;
        event.preventDefault();
        closeTab(activeTabId);
        return;
      }

      // Ctrl+Shift+W — close all tabs
      if (hasCommandModifier && key === 'w' && event.shiftKey && !event.altKey) {
        event.preventDefault();
        closeAllTabs();
        return;
      }

      // Ctrl+Tab / Ctrl+Shift+Tab — cycle tabs
      if (hasCommandModifier && key === 'tab') {
        event.preventDefault();
        const tabs = appStore.state.openedTabs;
        if (tabs.length === 0) return;
        const currentIdx = tabs.findIndex((t) => t.id === appStore.state.activeTabId);
        const nextIdx = event.shiftKey ? (currentIdx - 1 + tabs.length) % tabs.length : (currentIdx + 1) % tabs.length;
        appStore.setState((s) => ({
          ...s,
          activeTabId: tabs[nextIdx].id,
          activeConnectionId: 'connectionId' in tabs[nextIdx] ? tabs[nextIdx].connectionId : null,
        }));
        return;
      }

      // Ctrl+1..9 — jump to tab N
      if (hasCommandModifier && !event.shiftKey && !event.altKey && /^[1-9]$/.test(key)) {
        const idx = parseInt(key, 10) - 1;
        const tabs = appStore.state.openedTabs;
        if (idx < tabs.length) {
          event.preventDefault();
          appStore.setState((s) => ({
            ...s,
            activeTabId: tabs[idx].id,
            activeConnectionId: 'connectionId' in tabs[idx] ? tabs[idx].connectionId : null,
          }));
        }
        return;
      }

      // Ctrl+N — new query tab (if active connection is SQL)
      if (hasCommandModifier && key === 'n' && !event.shiftKey && !event.altKey) {
        const connId = appStore.state.activeConnectionId;
        if (connId) {
          const conn = connectionsRef.current?.find((c) => c.id === connId);
          if (conn && isSqlKind(conn.kind)) {
            event.preventDefault();
            openNewQueryTab(connId);
            return;
          }
        }
      }

      // Ctrl+Shift+K — open AI chat panel for active connection
      if (hasCommandModifier && key === 'k' && event.shiftKey && !event.altKey) {
        const connId = appStore.state.activeConnectionId;
        if (connId) {
          event.preventDefault();
          openAiChatPanel(connId);
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <TooltipProvider>
      <Toaster />
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} onShortcutsOpen={() => setShortcutsOpen(true)} />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <div className="flex h-screen w-screen flex-col">
        <Header onSearchOpen={() => setSearchOpen(true)} onShortcutsOpen={() => setShortcutsOpen(true)} />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          {view === 'api-settings' ? <ApiSettingsPage /> : view === 'logs' ? <LogsPage /> : <MainLayout />}
        </div>
      </div>
    </TooltipProvider>
  );
}

export default App;
