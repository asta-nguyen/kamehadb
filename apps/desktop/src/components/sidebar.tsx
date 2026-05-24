import { useStore } from "@tanstack/react-store";
import { useConnections } from "@/hooks/use-connections";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Database, Loader2, ChevronRight, ChevronDown } from "lucide-react";
import { ConnectionDialog } from "./connection-dialog";
import { SchemaTree } from "./schema-tree";
import { appStore, setActiveConnection, openTab } from "@/store";
import { useState } from "react";

const kindColors: Record<string, string> = {
  postgres: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  sqlite: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  mysql: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  redis: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

function ConnectionItem({
  conn,
  isActive,
  onSelect,
}: {
  conn: { id: string; name: string; kind: string };
  isActive: boolean;
  onSelect: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <button
        onClick={() => {
          onSelect();
          setExpanded(!expanded);
        }}
        className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-left text-sm hover:bg-muted transition-colors ${
          isActive ? "bg-muted" : ""
        }`}
      >
        {expanded ? <ChevronDown className="size-3 shrink-0" /> : <ChevronRight className="size-3 shrink-0" />}
        <Database className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate flex-1">{conn.name}</span>
        <Badge
          variant="outline"
          className={`text-[10px] px-1 py-0 h-4 ${kindColors[conn.kind] ?? ""}`}
        >
          {conn.kind}
        </Badge>
      </button>
      {expanded && isActive && (
        <div className="ml-3 pl-1 border-l border-border">
          <SchemaTree
            connectionId={conn.id}
            onSelectTable={(tableId) =>
              openTab({
                id: `${conn.id}:${tableId}`,
                type: "table",
                title: tableId,
                connectionId: conn.id,
              })
            }
          />
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const { data: connections, isLoading } = useConnections();
  const activeConnectionId = useStore(appStore, (state) => state.activeConnectionId);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <span className="text-xs font-medium text-muted-foreground">Connections</span>
        <ConnectionDialog />
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-0.5">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : connections?.length === 0 ? (
            <p className="text-xs text-muted-foreground px-2 py-4 text-center">
              No connections yet
            </p>
          ) : (
            connections?.map((conn) => (
              <ConnectionItem
                key={conn.id}
                conn={conn}
                isActive={conn.id === activeConnectionId}
                onSelect={() => setActiveConnection(conn.id)}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
