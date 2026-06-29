import type { AppView, PendingAiPrompt } from '@/lib/types';
import { appStore } from './state';

const LATENCY_SLOW_THRESHOLD = 500;

export function openAiChatPanel(connectionId: string): void {
  appStore.setState((state) => ({ ...state, activeConnectionId: connectionId, aiPanelConnectionId: connectionId }));
}

export function closeAiChatPanel(): void {
  appStore.setState((state) => ({ ...state, aiPanelConnectionId: null }));
}

/** Queue an AI prompt from a schema-tree right-click action. The AIChatPanel
 * watches this field and sends the prompt via its useChat instance, then
 * clears it. Using the store avoids prop-drilling through 4 component layers. */
export function setPendingAiPrompt(value: PendingAiPrompt): void {
  appStore.setState((state) => ({ ...state, pendingAiPrompt: value }));
}

/** Clear the pending AI prompt after the AIChatPanel has consumed it. */
export function clearPendingAiPrompt(): void {
  appStore.setState((state) => ({ ...state, pendingAiPrompt: null }));
}

export function navigateTo(view: AppView): void {
  appStore.setState((state) => ({ ...state, view }));
}

appStore.subscribe(() => {
  const { openedTabs, activeTabId } = appStore.state;
  try {
    localStorage.setItem('kamehadb_tabs', JSON.stringify(openedTabs));
    if (activeTabId) localStorage.setItem('kamehadb_active_tab', activeTabId);
    else localStorage.removeItem('kamehadb_active_tab');
  } catch {}
});

export function togglePinnedConnection(id: string): void {
  appStore.setState((state) => {
    const pinned = state.pinnedConnections.includes(id)
      ? state.pinnedConnections.filter((value) => value !== id)
      : [...state.pinnedConnections, id];
    localStorage.setItem('kamehadb_pinned', JSON.stringify(pinned));
    return { ...state, pinnedConnections: pinned };
  });
}

export function toggleExpandedConnection(id: string): void {
  appStore.setState((state) => {
    const expanded = state.expandedConnections.includes(id)
      ? state.expandedConnections.filter((value) => value !== id)
      : [...state.expandedConnections, id];
    return { ...state, expandedConnections: expanded };
  });
}

export function setConnectionStatus(id: string, status: 'connected' | 'slow' | 'disconnected' | 'reconnecting'): void {
  appStore.setState((state) => {
    if (state.connectionStatus[id] === status) return state;
    return { ...state, connectionStatus: { ...state.connectionStatus, [id]: status } };
  });
}

export function setConnectionLatency(id: string, latencyMs: number): void {
  appStore.setState((state) => ({
    ...state,
    connectionLatency: { ...state.connectionLatency, [id]: latencyMs },
    connectionStatus: { ...state.connectionStatus, [id]: latencyMs > LATENCY_SLOW_THRESHOLD ? 'slow' : 'connected' },
  }));
}

export function setTheme(theme: 'light' | 'dark' | 'system'): void {
  localStorage.setItem('theme', theme);
  appStore.setState((state) => ({ ...state, theme }));
  applyTheme(theme);
}

export function applyTheme(theme: 'light' | 'dark' | 'system'): void {
  const root = document.documentElement;
  if (theme === 'system') {
    root.classList.toggle('dark', window.matchMedia('(prefers-color-scheme: dark)').matches);
    return;
  }
  root.classList.toggle('dark', theme === 'dark');
}
