import { useState, useCallback, useMemo } from 'react';
import { useSchemas, useTables, useTableColumns } from '@/hooks/use-schema';
import { fuzzyMatch } from '@/lib/utils';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronRight, ChevronDown, Database, Table2, Columns3, Search, AlertCircle, RefreshCw } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';
import { AI_SCHEMA_ACTIONS, AI_SCHEMA_ACTION_ORDER } from '@/lib/constants';
import { openAiChatPanel, setPendingAiPrompt } from '@/store';
import { safeErrorMessage, type AiSchemaAction } from '@kamehadb/shared';

function SchemaItem({
  connectionId,
  schema,
  expanded,
  activeTableId,
  searchFilter,
  onToggle,
  onSelectTable,
}: {
  connectionId: string;
  schema: string;
  expanded: boolean;
  activeTableId: string | null;
  searchFilter: string;
  onToggle: () => void;
  onSelectTable: (tableId: string) => void;
}) {
  const {
    data: tables,
    isLoading,
    isError: isTablesError,
    error: tablesError,
    refetch: refetchTables,
  } = useTables(connectionId, schema);

  // The sidebar search covers both levels: a schema stays when its own name
  // matches and then keeps every table, or it stays with just the tables whose
  // names match. A schema with nothing to show drops out of the tree. (Why)
  const schemaMatches = !searchFilter || fuzzyMatch(searchFilter, schema);
  const visibleTables = useMemo(() => {
    if (!tables) return [];
    if (schemaMatches) return tables;
    return tables.filter((t) => fuzzyMatch(searchFilter, t.name));
  }, [tables, searchFilter, schemaMatches]);

  if (searchFilter && !schemaMatches && !isLoading && visibleTables.length === 0) return null;

  return (
    <div className="select-none">
      <Button variant="ghost" size="xs" onClick={onToggle} className="justify-start px-2 w-full font-normal">
        {expanded ? (
          <ChevronDown className="text-muted-foreground/60 shrink-0 size-3" />
        ) : (
          <ChevronRight className="text-muted-foreground/60 shrink-0 size-3" />
        )}
        <Database className="text-muted-foreground/60 shrink-0 size-3.5" />
        <span className="text-foreground/80 font-medium">{schema}</span>
        {expanded && tables && (
          <span className="ml-auto text-muted-foreground/50 text-xs tabular-nums">{visibleTables.length}</span>
        )}
      </Button>
      {expanded && (
        <div className="pl-2 ml-1.5 mt-0.5 border-border/60 border-l">
          <div className="pt-0.5 space-y-0.5">
            {isLoading ? (
              <div className="flex justify-center py-2">
                <Spinner size="sm" className="text-muted-foreground/60" />
              </div>
            ) : isTablesError ? (
              <div className="px-2 py-1 flex items-center justify-between text-xs text-destructive gap-1">
                <span className="truncate text-[11px]" title={safeErrorMessage(tablesError)}>
                  Failed to load tables
                </span>
                <Button variant="ghost" size="icon-xs" onClick={() => refetchTables()} className="size-5 p-0 shrink-0">
                  <RefreshCw className="size-3" />
                </Button>
              </div>
            ) : visibleTables.length === 0 ? (
              <p className="pl-2 py-1 text-muted-foreground/60 text-xs italic">
                {tables?.length === 0 ? 'No tables' : 'No matches'}
              </p>
            ) : (
              visibleTables.map((table) => (
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
  table: { id: string; name: string; schema?: string };
  activeTableId: string | null;
  onSelect: (tableId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { data: columns, isLoading } = useTableColumns(connectionId, expanded ? table.id : null);
  const isActive = activeTableId === `${connectionId}:${table.id}`;

  // Build the qualified table name for AI prompts: "schema.table" or just "table".
  const qualifiedName = table.schema ? `${table.schema}.${table.name}` : table.name;

  // Open the AI chat panel and queue a pre-seeded prompt for this table.
  // The AIChatPanel watches pendingAiPrompt and sends it via its useChat instance.
  function handleAiAction(action: AiSchemaAction) {
    openAiChatPanel(connectionId);
    setPendingAiPrompt({
      prompt: AI_SCHEMA_ACTIONS[action].buildPrompt(qualifiedName),
      tableId: table.id,
    });
  }

  return (
    <div className="select-none">
      <ContextMenu>
        <ContextMenuTrigger>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => onSelect(table.id)}
            onDoubleClick={() => setExpanded(!expanded)}
            className={`justify-start px-2 w-full font-normal ${isActive ? 'bg-muted/50' : ''}`}
          >
            <Table2 className={`shrink-0 size-3 ${isActive ? 'text-foreground' : 'text-muted-foreground/70'}`} />
            <span className={`truncate ${isActive ? 'text-foreground font-medium' : 'text-foreground/80'}`}>
              {table.name}
            </span>
          </Button>
        </ContextMenuTrigger>
        <ContextMenuContent>
          {AI_SCHEMA_ACTION_ORDER.map((action) => {
            const config = AI_SCHEMA_ACTIONS[action];
            const Icon = config.icon;
            return (
              <ContextMenuItem key={action} onClick={() => handleAiAction(action)}>
                <Icon className="mr-2 size-3.5" />
                {config.label}
              </ContextMenuItem>
            );
          })}
        </ContextMenuContent>
      </ContextMenu>
      {expanded && (
        <div className="pl-2 ml-2 mt-0.5 space-y-0">
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
                    className="px-1 py-0 h-3.5 text-muted-foreground/80 text-xs bg-muted/30 border-muted shrink-0"
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
  const { data: schemas, isLoading, error, isError, refetch } = useSchemas(connectionId);
  const [expandedSchemas, setExpandedSchemas] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const searchFilter = searchQuery.trim();
  const hasSearch = searchFilter.length > 0;

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
        <Spinner size="md" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-3 space-y-2">
        <div className="flex items-start gap-1.5 text-destructive text-xs">
          <AlertCircle className="size-4 shrink-0 mt-0.5" />
          <div className="space-y-1 min-w-0">
            <p className="font-medium">Failed to load schema</p>
            <p className="text-muted-foreground break-words text-[11px] leading-tight">
              {safeErrorMessage(error, 'Could not retrieve database schemas.')}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          className="w-full h-6 text-xs gap-1 text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className="size-3" />
          Retry
        </Button>
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
          placeholder="Search tables..."
          className="pl-6 pr-2 h-7 text-xs"
        />
      </div>
      {schemas.map((schema) => (
        <SchemaItem
          key={schema.name}
          connectionId={connectionId}
          schema={schema.name}
          searchFilter={searchFilter}
          // While a search is active every surviving schema opens itself, so the matching tables are on screen.
          expanded={hasSearch || expandedSchemas.has(schema.name)}
          activeTableId={activeTableId}
          onToggle={() => toggleSchema(schema.name)}
          onSelectTable={onSelectTable}
        />
      ))}
    </div>
  );
}
