import { useState, useCallback } from 'react';
import { useSchemas, useTables, useTableColumns } from '@/hooks/use-schema';

import { Badge } from '@/components/ui/badge';
import { ChevronRight, ChevronDown, Database, Table2, Columns3, Loader2 } from 'lucide-react';

function SchemaItem({
  connectionId,
  schema,
  expanded,
  onToggle,
  onSelectTable,
}: {
  connectionId: string;
  schema: string;
  expanded: boolean;
  onToggle: () => void;
  onSelectTable: (tableId: string) => void;
}) {
  const { data: tables, isLoading } = useTables(connectionId, schema);

  return (
    <div className="select-none">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs hover:bg-muted/70 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="size-3 text-muted-foreground/60 shrink-0" />
        ) : (
          <ChevronRight className="size-3 text-muted-foreground/60 shrink-0" />
        )}
        <Database className="size-3.5 text-muted-foreground/60 shrink-0" />
        <span className="font-medium text-foreground/80">{schema}</span>
        {expanded && tables && (
          <span className="ml-auto text-xs text-muted-foreground/50 tabular-nums">{tables.length}</span>
        )}
      </button>
      {expanded && (
        <div className="mt-0.5 ml-3 pl-2 border-l border-border/60 space-y-0.5">
          {isLoading ? (
            <div className="flex justify-center py-2">
              <Loader2 className="size-3 animate-spin text-muted-foreground/60" />
            </div>
          ) : tables?.length === 0 ? (
            <p className="text-xs text-muted-foreground/60 pl-2">No tables</p>
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
    <div className="select-none">
      <button
        onClick={() => onSelect(table.id)}
        onDoubleClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-1.5 px-2 py-1 rounded-md text-xs hover:bg-muted/50 transition-colors"
      >
        <Table2 className="size-3 text-muted-foreground/70 shrink-0" />
        <span className="truncate text-foreground/80">{table.name}</span>
      </button>
      {expanded && (
        <div className="mt-0.5 ml-4 pl-2 space-y-0">
          {isLoading ? (
            <div className="flex justify-center py-1.5">
              <Loader2 className="size-2.5 animate-spin text-muted-foreground/50" />
            </div>
          ) : (
            columns?.map((col) => (
              <div
                key={col.name}
                className="flex items-center gap-1.5 px-1.5 py-0.5 rounded hover:bg-muted/30 transition-colors"
              >
                <Columns3 className="size-2.5 text-muted-foreground/50 shrink-0" />
                <span className="truncate text-xs text-foreground/70" title={col.name}>
                  {col.name}
                </span>
                {col.primaryKey && <span className="size-1.5 rounded-full bg-primary shrink-0" title="Primary Key" />}
                <Badge
                  variant="outline"
                  className="ml-auto text-xs px-1 py-0 h-3.5 shrink-0 bg-muted/30 text-muted-foreground/80 border-muted"
                >
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
  const [expandedSchemas, setExpandedSchemas] = useState<Set<string>>(new Set());

  const toggleSchema = useCallback((schema: string) => {
    setExpandedSchemas((prev) => {
      const next = new Set(prev);
      if (next.has(schema)) {
        next.delete(schema);
      } else {
        next.add(schema);
      }
      return next;
    });
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!schemas?.length) {
    return <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">No schemas found</div>;
  }

  return (
    <div className="flex-1 overflow-y-auto min-h-0 p-1.5">
      {schemas?.map((schema) => (
        <SchemaItem
          key={schema.name}
          connectionId={connectionId}
          schema={schema.name}
          expanded={expandedSchemas.has(schema.name)}
          onToggle={() => toggleSchema(schema.name)}
          onSelectTable={onSelectTable}
        />
      ))}
    </div>
  );
}
