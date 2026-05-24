import { useStore } from "@tanstack/react-store";
import { Sidebar } from "@/components/sidebar";
import { TableView } from "@/components/table-view";
import { SqlEditor } from "@/components/sql-editor";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { appStore, openTab, closeTab } from "@/store";
import { X, Terminal, Table2 } from "lucide-react";
import { nanoid } from "nanoid";

function TabBar() {
  const openedTabs = useStore(appStore, (state) => state.openedTabs);
  const activeTabId = useStore(appStore, (state) => state.activeTabId);

  return (
    <div className="flex items-center h-8 border-b border-border bg-muted/20 shrink-0 overflow-x-auto">
      {openedTabs.map((tab) => (
        <div
          key={tab.id}
          className={`flex items-center gap-1.5 px-3 h-full border-r border-border cursor-pointer text-xs shrink-0 select-none ${
            tab.id === activeTabId
              ? "bg-background border-b-2 border-b-primary"
              : "hover:bg-muted/50"
          }`}
          onClick={() => appStore.setState((s) => ({ ...s, activeTabId: tab.id }))}
        >
          {tab.type === "query" ? (
            <Terminal className="size-3" />
          ) : (
            <Table2 className="size-3" />
          )}
          <span className="truncate max-w-[120px]">{tab.title}</span>
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
      ))}
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
          <p className="text-sm text-muted-foreground">
            Create or select a connection to get started
          </p>
        </div>
      </div>
    );
  }

  if (openedTabs.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-sm text-muted-foreground">Select a table or open a query tab</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              openTab({
                id: nanoid(),
                type: "query",
                title: "Query 1",
                connectionId: activeConnectionId,
              })
            }
          >
            <Terminal className="size-3.5 mr-1.5" />
            New Query
          </Button>
        </div>
      </div>
    );
  }

  const activeTab = openedTabs.find((t) => t.id === activeTabId) ?? openedTabs[0];

  return (
    <div className="h-full flex flex-col">
      {activeTab.type === "query" && <SqlEditor connectionId={activeConnectionId} />}
      {activeTab.type === "table" && (
        <TableView connectionId={activeConnectionId} tableId={activeTab.title} />
      )}
    </div>
  );
}

function App() {
  return (
    <TooltipProvider>
      <div className="h-screen w-screen flex flex-col">
        <header className="h-9 border-b border-border flex items-center px-4 shrink-0 bg-background">
          <span className="font-semibold text-sm">kamehadb</span>
        </header>
        <div className="flex-1 flex overflow-hidden">
          <aside className="w-56 border-r border-border shrink-0 flex flex-col bg-muted/30">
            <Sidebar />
          </aside>
          <main className="flex-1 bg-background flex flex-col overflow-hidden">
            <TabBar />
            <div className="flex-1 overflow-hidden">
              <Workspace />
            </div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}

export default App;
