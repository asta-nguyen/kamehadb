import { Store } from "@tanstack/store";
import { nanoid } from "nanoid";
import type { AppStoreState, AppView, WorkspaceTab } from "@kamehadb/shared";

const initialState: AppStoreState = {
  activeConnectionId: null,
  activeDatabaseId: null,
  activeSchemaId: null,
  activeTableId: null,
  openedTabs: [],
  activeTabId: null,
  sidebarCollapsed: false,
  density: "compact",
  view: "workspace",
};

export const appStore = new Store<AppStoreState>(initialState);

export function setActiveConnection(id: string | null) {
  appStore.setState((state) => ({ ...state, activeConnectionId: id }));
}

let queryCounter = 0;

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

export function openNewQueryTab(connectionId: string) {
  queryCounter++;
  const tab: WorkspaceTab = {
    id: `query-${nanoid()}`,
    type: "query",
    title: `Query ${queryCounter}`,
    connectionId,
    sql: "SELECT * FROM ",
  };
  openTab(tab);
}

export function openGraphTab(connectionId: string) {
  openTab({
    id: `${connectionId}:graph`,
    type: "graph" as const,
    title: "Schema Graph",
    connectionId,
  });
}

export function updateTabSql(tabId: string, sql: string) {
  appStore.setState((state) => ({
    ...state,
    openedTabs: state.openedTabs.map((t) =>
      t.id === tabId ? { ...t, sql } : t
    ),
  }));
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

export function navigateTo(view: AppView) {
  appStore.setState((state) => ({ ...state, view }));
}

export function toggleSidebar() {
  appStore.setState((state) => ({ ...state, sidebarCollapsed: !state.sidebarCollapsed }));
}
