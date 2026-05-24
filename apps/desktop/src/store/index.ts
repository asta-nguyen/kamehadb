import { Store } from "@tanstack/store";
import type { AppStoreState, WorkspaceTab } from "@kamehadb/shared";

const initialState: AppStoreState = {
  activeConnectionId: null,
  activeDatabaseId: null,
  activeSchemaId: null,
  activeTableId: null,
  openedTabs: [],
  activeTabId: null,
  sidebarCollapsed: false,
  density: "compact",
};

export const appStore = new Store<AppStoreState>(initialState);

export function setActiveConnection(id: string | null) {
  appStore.setState((state) => ({ ...state, activeConnectionId: id }));
}

export function openTab(tab: WorkspaceTab) {
  appStore.setState((state) => {
    const exists = state.openedTabs.find((t) => t.id === tab.id);
    if (exists) return { ...state, activeTabId: tab.id };
    return {
      ...state,
      openedTabs: [...state.openedTabs, tab],
      activeTabId: tab.id,
    };
  });
}

export function closeTab(tabId: string) {
  appStore.setState((state) => {
    const tabs = state.openedTabs.filter((t) => t.id !== tabId);
    const activeTabId = state.activeTabId === tabId
      ? (tabs[tabs.length - 1]?.id ?? null)
      : state.activeTabId;
    return { ...state, openedTabs: tabs, activeTabId };
  });
}

export function toggleSidebar() {
  appStore.setState((state) => ({ ...state, sidebarCollapsed: !state.sidebarCollapsed }));
}
