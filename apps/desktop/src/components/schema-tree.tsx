import { useState, useCallback, useMemo } from 'react';
import { useSchemas, useTables, useTableColumns } from '@/hooks/use-schema';
import { fuzzyMatch } from '@/lib/utils';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronRight, ChevronDown, Database, Table2, Columns3, Search } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';

function SchemaItem({
  connectionId,
  schema,
  expanded,
  activeTableId,
  onToggle,
  onSelectTable,
}: {
  connectionId: string;
  schema: string;
  expanded: boolean;
  activeTableId: string | null;
  onToggle: () => void;
  onSelectTable: (tableId: string) => void;
}) {
  const { data: tables, isLoading } = useTables(connectionId, schema);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredTables = useMemo(() => {
    if (!tables) return [];
    const q = searchQuery.trim();
    if (!q) return tables;
    return tables.filter((t) => fuzzyMatch(q, t.name));
  }, [tables, searchQuery]);

  return (
    <div className="select-none">
      <Button variant="ghost" size="sm" onClick={onToggle} className="justify-start px-2 w-full font-normal">
        {expanded ? (
          <ChevronDown className="text-muted-foreground/60 shrink-0 size-3" />
        ) : (
          <ChevronRight className="text-muted-foreground/60 shrink-0 size-3" />
        )}
        <Database className="text-muted-foreground/60 shrink-0 size-3.5" />
        <span className="text-foreground/80 font-medium">{schema}</span>
        {expanded && tables && (
          <span className="ml-auto text-muted-foreground/50 text-xs tabular-nums">{tables.length}</span>
        )}
      </Button>
      {expanded && (
        <div className="pl-2 ml-3 mt-0.5 border-border/60 border-l">
          <div className="px-2 py-1">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground pointer-events-none" />
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter..."
                className="pl-6 pr-2 h-6 text-xs"
              />
            </div>
          </div>
          <div className="space-y-0.5">
            {isLoading ? (
              <div className="flex justify-center py-2">
                <Spinner size="sm" className="text-muted-foreground/60" />
              </div>
            ) : filteredTables.length === 0 ? (
              <p className="pl-2 py-1 text-muted-foreground/60 text-xs italic">
                {tables?.length === 0 ? 'No tables' : 'No matches'}
              </p>
            ) : (
              filteredTables.map((table) => (
                <TableItem
                  key={table.id}
                  connectionId={connectionId}
                  table={table}
                  activeTableId={activeTableId}
                  onSelect={onSelectTable}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TableItem({
  connectionId,
  table,
  activeTableId,
  onSelect,
}: {
  connectionId: string;
  table: { id: string; name: string };
  activeTableId: string | null;
  onSelect: (tableId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { data: columns, isLoading } = useTableColumns(connectionId, expanded ? table.id : null);
  const isActive = activeTableId === `${connectionId}:${table.id}`;

  return (
    <div className="select-none">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onSelect(table.id)}
        onDoubleClick={() => setExpanded(!expanded)}
        className={`justify-start px-2 w-full font-normal ${isActive ? 'bg-muted/50' : ''}`}
      >
        <Table2 className={`shrink-0 size-3 ${isActive ? 'text-foreground' : 'text-muted-foreground/70'}`} />
        <span className={`truncate ${isActive ? 'text-foreground font-medium' : 'text-foreground/80'}`}>
          {table.name}
        </span>
      </Button>
      {expanded && (
        <div className="pl-2 ml-4 mt-0.5 space-y-0">
          {isLoading ? (
            <div className="flex justify-center py-1.5">
              <Spinner size="sm" className="text-muted-foreground/50 size-2.5" />
            </div>
          ) : (
            columns?.map((col) => (
              <div
                key={col.name}
                className="flex items-center px-1.5 py-0.5 rounded-xs gap-1.5 transition-colors hover:bg-muted/30"
              >
                <Columns3 className="text-muted-foreground/50 shrink-0 size-2.5" />
                <span className="text-foreground/70 text-xs truncate" title={col.name}>
                  {col.name}
                </span>
                {col.primaryKey && <span className="bg-primary rounded-full shrink-0 size-1.5" title="Primary Key" />}
                {col.isVector && (
                  <Badge
                    variant="secondary"
                    className="px-1 py-0 h-3.5 text-muted-foreground/80 text-[10px] bg-muted/30 border-muted shrink-0"
                  >
                    vector{col.vectorDimensions ? `(${col.vectorDimensions})` : ''}
                  </Badge>
                )}
                <Badge
                  variant="outline"
                  className="px-1 py-0 ml-auto h-3.5 text-muted-foreground/80 text-xs bg-muted/30 border-muted shrink-0"
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
  activeTableId,
  onSelectTable,
}: {
  connectionId: string;
  activeTableId: string | null;
  onSelectTable: (tableId: string) => void;
}) {
  const { data: schemas, isLoading } = useSchemas(connectionId);
  const [expandedSchemas, setExpandedSchemas] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const hasSearch = searchQuery.trim().length > 0;

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

  // Show matching schemas with all tables expanded when searching
  const visibleSchemas = useMemo(() => {
    if (!schemas) return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return schemas;
    return schemas.filter((s) => fuzzyMatch(q, s.name));
  }, [schemas, searchQuery]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Spinner size="md" />
      </div>
    );
  }

  if (!schemas?.length) {
    return <div className="flex items-center justify-center py-6 text-muted-foreground text-xs">No schemas found</div>;
  }

  return (
    <div className="flex-1 p-1.5 min-h-0 overflow-y-auto space-y-0.5">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground pointer-events-none" />
        <Input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search schemas & tables..."
          className="pl-6 pr-2 h-7 text-xs"
        />
      </div>
      {visibleSchemas.map((schema) => (
        <SchemaItem
          key={schema.name}
          connectionId={connectionId}
          schema={schema.name}
          expanded={hasSearch || expandedSchemas.has(schema.name)}
          activeTableId={activeTableId}
          onToggle={() => toggleSchema(schema.name)}
          onSelectTable={onSelectTable}
        />
      ))}
    </div>
  );
}
