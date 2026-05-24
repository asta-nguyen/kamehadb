import { useState } from "react";
import { useSchemas, useTables, useTableColumns } from "@/hooks/use-schema";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, ChevronDown, Database, Table2, Columns3, Loader2 } from "lucide-react";

function SchemaItem({
  connectionId,
  schema,
  onSelectTable,
}: {
  connectionId: string;
  schema: string;
  onSelectTable: (tableId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { data: tables, isLoading } = useTables(connectionId, schema);

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-1.5 px-2 py-1 text-xs hover:bg-muted rounded-md"
      >
        {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        <Database className="size-3.5 text-muted-foreground" />
        <span>{schema}</span>
      </button>
      {expanded && (
        <div className="ml-3 border-l border-border pl-2">
          {isLoading ? (
            <Loader2 className="size-3 animate-spin my-1 mx-auto" />
          ) : (
            tables?.map((table) => (
              <TableItem key={table.id} connectionId={connectionId} table={table} onSelect={onSelectTable} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function TableItem({
  connectionId,
  table,
  onSelect,
}: {
  connectionId: string;
  table: { id: string; name: string };
  onSelect: (tableId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { data: columns, isLoading } = useTableColumns(connectionId, expanded ? table.id : null);

  return (
    <div>
      <button
        onClick={() => onSelect(table.id)}
        onDoubleClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-1.5 px-2 py-1 text-xs hover:bg-muted rounded-md"
      >
        {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        <Table2 className="size-3.5 text-muted-foreground" />
        <span className="truncate">{table.name}</span>
      </button>
      {expanded && (
        <div className="ml-3">
          {isLoading ? (
            <Loader2 className="size-3 animate-spin my-1 mx-auto" />
          ) : (
            columns?.map((col) => (
              <div
                key={col.name}
                className="flex items-center gap-1.5 px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                <Columns3 className="size-3" />
                <span className="truncate">{col.name}</span>
                <Badge variant="outline" className="text-[10px] px-1 py-0 h-3.5 ml-auto">
                  {col.type}
                </Badge>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function SchemaTree({
  connectionId,
  onSelectTable,
}: {
  connectionId: string;
  onSelectTable: (tableId: string) => void;
}) {
  const { data: schemas, isLoading } = useSchemas(connectionId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="p-1 space-y-0.5">
        {schemas?.map((schema) => (
          <SchemaItem
            key={schema.name}
            connectionId={connectionId}
            schema={schema.name}
            onSelectTable={onSelectTable}
          />
        ))}
      </div>
    </ScrollArea>
  );
}
