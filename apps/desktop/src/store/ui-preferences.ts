import type { AppView } from '@/lib/types';
import type { ThemePreset } from '@/lib/theme-presets';
import { applyThemePreset, saveThemePreset } from '@/lib/theme-presets';
import { appStore } from './state';

const LATENCY_SLOW_THRESHOLD = 500;

export function openAiChatPanel(connectionId: string): void {
  appStore.setState((state) => ({ ...state, activeConnectionId: connectionId, aiPanelConnectionId: connectionId }));
}

export function closeAiChatPanel(): void {
  appStore.setState((state) => ({ ...state, aiPanelConnectionId: null }));
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
  } else {
    root.classList.toggle('dark', theme === 'dark');
  }
  // Re-apply theme preset colors for the new dark/light state
  const { themePreset } = appStore.state;
  if (themePreset) {
    applyThemePreset(themePreset, root.classList.contains('dark'));
  }
}

export function setDensity(density: 'compact' | 'comfortable'): void {
  localStorage.setItem('kamehadb_density', density);
  appStore.setState((state) => ({ ...state, density }));
  applyDensity(density);
}

export function applyDensity(density: 'compact' | 'comfortable'): void {
  document.documentElement.classList.toggle('density-compact', density === 'compact');
  // Re-apply theme preset so density vars match the new mode
  const { themePreset } = appStore.state;
  if (themePreset) {
    applyThemePreset(themePreset, document.documentElement.classList.contains('dark'));
  }
}

export function setThemePreset(preset: ThemePreset): void {
  saveThemePreset(preset);
  appStore.setState((state) => ({ ...state, themePreset: preset }));
  const isDark = document.documentElement.classList.contains('dark');
  applyThemePreset(preset, isDark);
}

export function applyThemePresetToDOM(preset: ThemePreset): void {
  const isDark = document.documentElement.classList.contains('dark');
  applyThemePreset(preset, isDark);
}
