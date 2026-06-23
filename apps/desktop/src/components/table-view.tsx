import { useCallback, useMemo, useReducer, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { debounce } from '@tanstack/pacer';
import { useTableColumns, useTableIndexes, usePreviewRows, useTables } from '@/hooks/use-schema';
import { useRunQuery } from '@/hooks/use-query';
import { useFieldVisibility } from '@/hooks/use-field-visibility';
import { TableStats } from '@/components/table-stats';
import { TableEditabilityNotice } from '@/components/table-editability-notice';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { DataTable, type ColumnDef } from '@/components/data-table';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import {
  Key,
  Hash,
  Table2,
  ChevronLeft,
  ChevronRight,
  FileJson,
  Copy,
  Check,
  Eye,
  Activity,
  Download,
  Ellipsis,
  Search,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  X,
  Trash2,
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { downloadResult } from '@/lib/export';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { buildRowUpdateQuery, getTableEditabilityState } from '@/lib/table-editability';

type TableViewProps = {
  connectionId: string;
  tableId: string;
};

// Group offset/pageSize/selectedRow/search/sort state into one reducer so a
// single dispatch produces a single re-render instead of seven.
type DataGridState = {
  offset: number;
  pageSize: number;
  selectedRow: Record<string, unknown> | null;
  searchText: string;
  querySearch: string;
  sortColumn: string;
  sortDirection: 'asc' | 'desc';
};

type DataGridAction =
  | { type: 'setOffset'; value: number }
  | { type: 'setPageSize'; value: number }
  | { type: 'selectRow'; row: Record<string, unknown> | null }
  | { type: 'setSearchText'; value: string }
  | { type: 'setQuerySearch'; value: string }
  | { type: 'setSortColumn'; value: string }
  | { type: 'setSortDirection'; value: 'asc' | 'desc' }
  | { type: 'cycleSort'; column: string }
  | { type: 'clearSort' };

function dataGridReducer(state: DataGridState, action: DataGridAction): DataGridState {
  switch (action.type) {
    case 'setOffset':
      return { ...state, offset: action.value };
    case 'setPageSize':
      return { ...state, pageSize: action.value, offset: 0 };
    case 'selectRow':
      return { ...state, selectedRow: action.row };
    case 'setSearchText':
      return { ...state, searchText: action.value };
    case 'setQuerySearch':
      return { ...state, querySearch: action.value, offset: 0 };
    case 'setSortColumn':
      return { ...state, sortColumn: action.value };
    case 'setSortDirection':
      return { ...state, sortDirection: action.value };
    case 'cycleSort':
      if (state.sortColumn === action.column) {
        if (state.sortDirection === 'asc') return { ...state, sortDirection: 'desc' as const };
        return { ...state, sortColumn: '', sortDirection: 'asc' as const, offset: 0 };
      }
      return { ...state, sortColumn: action.column, sortDirection: 'asc' as const, offset: 0 };
    case 'clearSort':
      return { ...state, sortColumn: '', sortDirection: 'asc' as const, offset: 0 };
  }
}

function DataGrid({ connectionId, tableId }: { connectionId: string; tableId: string }) {
  const [state, dispatch] = useReducer(dataGridReducer, {
    offset: 0,
    pageSize: 50,
    selectedRow: null,
    searchText: '',
    querySearch: '',
    sortColumn: '',
    sortDirection: 'asc',
  });
  const debouncedSetSearch = useRef<ReturnType<typeof debounce<(v: string) => void>> | null>(null);
  if (debouncedSetSearch.current === null) {
    debouncedSetSearch.current = debounce(
      (v: string) => {
        dispatch({ type: 'setQuerySearch', value: v });
      },
      { wait: 300 },
    );
  }
  const debouncedSearchFn = debouncedSetSearch.current;

  const queryClient = useQueryClient();
  const runQuery = useRunQuery(connectionId);
  const [tableSchema] = tableId.split('.');
  const { data: tables } = useTables(connectionId, tableSchema);
  const isView = tables?.find((t) => t.id === tableId)?.type === 'view';
  const { data: columns, isLoading: isLoadingColumns } = useTableColumns(connectionId, tableId);
  const { data: result, isLoading } = usePreviewRows(connectionId, {
    tableId,
    offset: state.offset,
    limit: state.pageSize,
    search: state.querySearch || undefined,
    sortColumn: state.sortColumn || undefined,
    sortDirection: state.sortColumn ? state.sortDirection : undefined,
  });

  const [editingCell, setEditingCell] = useState<{ rowIndex: number; column: string } | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  // Find primary key columns for constructing UPDATE WHERE clause
  const pkColumns = useMemo(
    () => (columns && columns.length > 0 ? columns.filter((c) => c.primaryKey).map((c) => c.name) : []),
    [columns],
  );

  const editability = getTableEditabilityState({
    hasPrimaryKey: pkColumns.length > 0,
    isReadOnly: false,
  });

  // Only show the missing-PK warning after schema metadata has loaded,
  // because preview rows often arrive before columns and otherwise the UI
  // flashes a false "No primary key" state during the first render.
  const showNoPrimaryKeyWarning = !isLoadingColumns && !!columns && pkColumns.length === 0 && !isView;

  const page = Math.floor(state.offset / state.pageSize) + 1;
  // Prefer schema metadata because several adapters cannot infer columns from
  // an empty page; result metadata remains the fallback while schema loads.
  const displayColumns = columns && columns.length > 0 ? columns : (result?.columns ?? []);
  const displayColumnNames = displayColumns.map((column) => column.name);
  const { visibleFields: visibleColumns } = useFieldVisibility(displayColumnNames, `${connectionId}:${tableId}`);

  // Detect date/timestamp columns so the editing cell uses date/datetime-local
  // input type and serialises with a SQL cast instead of plain string quoting.
  const dateColumns = useMemo(
    () =>
      new Set(
        displayColumns
          .filter((c) => {
            const t = c.type.toLowerCase();
            return (
              t === 'date' || t === 'timestamp' || t === 'timestamptz' || t === 'datetime' || t.startsWith('timestamp')
            );
          })
          .map((c) => c.name),
      ),
    [displayColumns],
  );

  const saveCellEdit = useCallback(
    (rowIndex: number, column: string, newValue: string, colType?: string) => {
      setEditingCell(null);
      if (!result) return;
      const row = result.rows[rowIndex];
      if (!row) return;
      const oldValue = row[column];
      if (String(oldValue ?? '') === newValue) return;
      const sql = buildRowUpdateQuery({
        tableId,
        row,
        column,
        newValue,
        columnType: colType,
        pkColumns,
        allColumnNames: displayColumnNames,
        dateColumns,
      });

      runQuery.mutate(
        { query: sql },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['previewRows', connectionId, tableId] });
          },
          onError: (err) => {
            console.error('Failed to update row:', err);
            queryClient.invalidateQueries({ queryKey: ['previewRows', connectionId, tableId] });
          },
        },
      );
    },
    [result, pkColumns, dateColumns, runQuery, queryClient, connectionId, tableId, displayColumnNames],
  );

  const tableColumns: ColumnDef<Record<string, unknown>>[] = displayColumns
    .filter((col) => visibleColumns.includes(col.name))
    .map((col) => ({
      id: col.name,
      header: col.name,
      accessor: (row) => row[col.name],
      sortable: true,
      render: (value, _row, rowIndex) => {
        const isEditing = editingCell?.rowIndex === rowIndex && editingCell?.column === col.name;
        const isDate = dateColumns.has(col.name);
        if (isEditing) {
          const inputType =
            isDate && typeof value === 'string'
              ? col.type.toLowerCase() === 'date'
                ? 'date'
                : 'datetime-local'
              : 'text';
          // Convert ISO timestamps to the format expected by datetime-local/date inputs
          const formatDefault = (v: unknown): string => {
            if (v === null || v === undefined) return '';
            const s = String(v);
            if (isDate && s.includes('T')) {
              // "2024-01-15T10:30:00.000Z" → "2024-01-15T10:30" (datetime-local)
              // or "2024-01-15" (date)
              if (inputType === 'date') return s.slice(0, 10);
              return s.slice(0, 16);
            }
            return s;
          };
          return (
            <Input
              ref={editInputRef}
              type={inputType}
              defaultValue={formatDefault(value)}
              autoFocus
              className="h-7 text-xs min-w-0"
              onClick={(e) => e.stopPropagation()}
              onBlur={(e) => setTimeout(() => saveCellEdit(rowIndex, col.name, e.target.value, col.type), 150)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur();
                } else if (e.key === 'Escape') {
                  setEditingCell(null);
                }
              }}
            />
          );
        }
        return (
          <span
            onDoubleClick={editability.canEditCells ? () => setEditingCell({ rowIndex, column: col.name }) : undefined}
            className={editability.canEditCells ? 'cursor-pointer block w-full' : 'block w-full'}
          >
            {value === null ? (
              <span className="text-muted-foreground italic">null</span>
            ) : value === undefined ? (
              <span className="text-muted-foreground">-</span>
            ) : typeof value === 'object' ? (
              <span className="text-primary">{JSON.stringify(value)}</span>
            ) : (
              <span>{String(value)}</span>
            )}
          </span>
        );
      },
    }));

  if (isLoading && !result) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!result) return null;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 mb-3 shrink-0">
        <div className="relative flex-1 max-w-64">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={state.searchText}
            onChange={(e) => {
              dispatch({ type: 'setSearchText', value: e.target.value });
              debouncedSearchFn(e.target.value);
            }}
            placeholder="Search all fields..."
            className="h-7 pl-7 text-xs"
          />
        </div>
        <div className="flex items-center gap-1">
          <Select
            value={state.sortColumn}
            onValueChange={(v) => {
              if (!v) return;
              dispatch({ type: 'cycleSort', column: v });
            }}
          >
            <SelectTrigger className="h-7 w-28 text-xs gap-1.5 px-2">
              <ArrowUpDown className="size-3.5 text-muted-foreground" />
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              {displayColumns.map((col) => (
                <SelectItem key={col.name} value={col.name} className="text-xs">
                  {col.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {state.sortColumn && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => dispatch({ type: 'clearSort' })}
              className="h-7 w-7"
              title="Clear sort"
            >
              <X className="size-3" />
            </Button>
          )}
          {state.sortColumn && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() =>
                dispatch({
                  type: 'setSortDirection',
                  value: state.sortDirection === 'asc' ? 'desc' : 'asc',
                })
              }
              className="h-7 w-7 shrink-0"
              title={`Sorted ${state.sortDirection === 'asc' ? 'ascending' : 'descending'}`}
            >
              {state.sortDirection === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
            </Button>
          )}
        </div>
      </div>
      {editability.warningMessage && editability.warningTone && (
        <div className="shrink-0">
          <TableEditabilityNotice message={editability.warningMessage} tone={editability.warningTone} />
        </div>
      )}
      {isView && (
        <div className="mb-2 px-3 py-1.5 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/40 rounded-md">
          This is a view — in-cell editing is not supported.
        </div>
      )}
      {showNoPrimaryKeyWarning && !isView && (
        <div className="mb-2 px-3 py-1.5 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 rounded-md">
          No primary key — in-cell editing disabled to prevent ambiguous row updates.
        </div>
      )}
      <div className="min-h-0 max-h-full flex flex-col border border-border rounded-md overflow-hidden">
        <div className="overflow-auto min-h-0">
          <DataTable
            rows={result.rows}
            columns={tableColumns}
            rowKey={(_, i) => String(i)}
            suffixHeader="Actions"
            suffixWidth="64px"
            showIndex
            indexOffset={state.offset}
            stickyHeader
            onSortChange={(col) => dispatch({ type: 'cycleSort', column: col })}
            sortColumn={state.sortColumn}
            sortDirection={state.sortDirection}
            suffix={(row) => (
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
                  <Ellipsis className="size-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem onClick={() => dispatch({ type: 'selectRow', row })}>
                    <Eye className="size-3.5 mr-2" />
                    View details
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigator.clipboard.writeText(JSON.stringify(row, null, 2))}>
                    <Copy className="size-3.5 mr-2" />
                    Copy row
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => dispatch({ type: 'selectRow', row })}>
                    <Trash2 className="size-3.5 mr-2" />
                    Delete row
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            className="text-xs"
          />
        </div>
        {result && (
          <div className="shrink-0 px-3 py-1.5 text-xs text-muted-foreground border-t bg-muted/30 flex items-center gap-2 rounded-b-md">
            <div className="flex items-center gap-1">
              <Select
                value={String(state.pageSize)}
                onValueChange={(v) => {
                  dispatch({ type: 'setPageSize', value: Number(v) });
                }}
              >
                <SelectTrigger className="h-7 w-16 text-xs gap-1 px-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[10, 25, 50, 100, 200, 500].map((n) => (
                    <SelectItem key={n} value={String(n)} className="text-xs">
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <span>{result.rowCount} rows</span>
            <span className="ml-auto">{result.durationMs}ms</span>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <span>Page</span>
                <Input
                  type="number"
                  min={1}
                  value={page}
                  onChange={(e) => {
                    const p = parseInt(e.target.value, 10);
                    if (!isNaN(p) && p >= 1) dispatch({ type: 'setOffset', value: (p - 1) * state.pageSize });
                  }}
                  className="h-7 w-14 text-xs text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={state.offset === 0}
                  onClick={() => dispatch({ type: 'setOffset', value: Math.max(0, state.offset - state.pageSize) })}
                >
                  <ChevronLeft className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={!result.truncated}
                  onClick={() => dispatch({ type: 'setOffset', value: state.offset + state.pageSize })}
                >
                  <ChevronRight className="size-3.5" />
                </Button>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" className="h-7 w-7" />}>
                <Download className="size-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => downloadResult(result, 'csv')}>Export as CSV</DropdownMenuItem>
                <DropdownMenuItem onClick={() => downloadResult(result, 'json')}>Export as JSON</DropdownMenuItem>
                <DropdownMenuItem onClick={() => downloadResult(result, 'sql')}>Export as SQL</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      <Sheet
        open={!!state.selectedRow}
        onOpenChange={(open) => {
          if (!open) dispatch({ type: 'selectRow', row: null });
        }}
      >
        <SheetContent className="sm:max-w-lg flex flex-col">
          <SheetHeader className="shrink-0">
            <SheetTitle className="flex items-center gap-2">
              <FileJson className="size-4" />
              Record #{state.selectedRow && result ? state.offset + result.rows.indexOf(state.selectedRow) + 1 : ''}
            </SheetTitle>
          </SheetHeader>
          <RecordDetailTabs selectedRow={state.selectedRow} />
        </SheetContent>
      </Sheet>
    </div>
  );
}

function formatJsonSyntax(json: string): React.ReactNode[] {
  const lines = json.split('\n');
  return lines.map((line, i) => {
    const parts: React.ReactNode[] = [];
    let lastIdx = 0;

    // Tokenize raw JSON text without HTML escaping — React renders text
    // safely, so we match actual quote characters instead of HTML entities.
    const regex =
      /("[^"\\]*(?:\\.[^"\\]*)*")(?=\s*:)|:\s*("[^"\\]*(?:\\.[^"\\]*)*")|:\s*(true|false)|:\s*(null)|:\s*(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
    let match;
    while ((match = regex.exec(line)) !== null) {
      parts.push(line.slice(lastIdx, match.index));
      if (match[1])
        parts.push(
          <span key={`k-${i}-${parts.length}`} className="text-primary">
            {match[1]}
          </span>,
        );
      else if (match[2])
        parts.push(
          <span key={`s-${i}-${parts.length}`}>
            : <span className="text-muted-foreground">{match[2]}</span>
          </span>,
        );
      else if (match[3])
        parts.push(
          <span key={`b-${i}-${parts.length}`}>
            : <span className="text-accent-foreground">{match[3]}</span>
          </span>,
        );
      else if (match[4])
        parts.push(
          <span key={`n-${i}-${parts.length}`}>
            : <span className="text-muted-foreground italic">{match[4]}</span>
          </span>,
        );
      else if (match[5])
        parts.push(
          <span key={`num-${i}-${parts.length}`}>
            : <span className="text-foreground">{match[5]}</span>
          </span>,
        );
      lastIdx = regex.lastIndex;
    }
    parts.push(line.slice(lastIdx));

    return (
      <div key={`${i}-${line.slice(0, 50)}`} className="flex">
        <span className="w-8 shrink-0 text-right text-xs text-muted-foreground/40 select-none mr-3">{i + 1}</span>
        <span className="flex-1">{parts}</span>
      </div>
    );
  });
}

export function RecordDetailTabs({ selectedRow }: { selectedRow: Record<string, unknown> | null }) {
  const [copied, setCopied] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const handleCopy = useCallback(async () => {
    if (!selectedRow) return;
    await navigator.clipboard.writeText(JSON.stringify(selectedRow, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [selectedRow]);

  const handleCopyField = useCallback(async (key: string, value: unknown) => {
    const text = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
    await navigator.clipboard.writeText(text);
    setCopiedField(key);
    setTimeout(() => setCopiedField(null), 1500);
  }, []);

  if (!selectedRow) return null;

  return (
    <Tabs defaultValue="view" className="flex-1 flex flex-col min-h-0">
      <div className="shrink-0 px-4">
        <TabsList>
          <TabsTrigger value="view" className="text-xs">
            View
          </TabsTrigger>
          <TabsTrigger value="json" className="text-xs">
            JSON
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="view" className="flex-1 min-h-0 p-0">
        <div className="h-full overflow-y-auto">
          <div className="pb-2">
            {Object.entries(selectedRow).map(([key, value], i) => {
              const typeLabel = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
              return (
                <div key={key} className={`flex items-start gap-3 px-4 py-2 ${i % 2 === 0 ? 'bg-muted/20' : ''}`}>
                  <div className="w-2/5 shrink-0 min-w-0">
                    <div className="text-xs font-medium truncate">{key}</div>
                    <span className="text-xs uppercase text-muted-foreground/50 tracking-wider">{typeLabel}</span>
                  </div>
                  <div className="flex-1 min-w-0 text-sm font-mono break-all leading-snug group/field">
                    {value === null ? (
                      <span className="text-muted-foreground italic">null</span>
                    ) : typeof value === 'object' ? (
                      <pre className="text-xs whitespace-pre-wrap bg-muted/50 rounded p-2 mt-0.5 max-h-32 overflow-auto">
                        {JSON.stringify(value, null, 2)}
                      </pre>
                    ) : (
                      <span className="text-foreground/90">{String(value)}</span>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleCopyField(key, value)}
                      className="size-5 rounded opacity-0 group-hover/field:opacity-100 transition-opacity ml-1 align-middle hover:bg-muted-foreground/20"
                      title="Copy value"
                    >
                      {copiedField === key ? (
                        <Check className="size-3 text-primary" />
                      ) : (
                        <Copy className="size-3 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </TabsContent>

      <TabsContent value="json" className="flex-1 min-h-0 p-0">
        <div className="relative h-full">
          <Button variant="outline" size="icon-sm" className="absolute top-2 right-2 z-10" onClick={handleCopy}>
            {copied ? <Check className="size-3.5 text-primary" /> : <Copy className="size-3.5" />}
          </Button>
          <div className="h-full overflow-y-auto">
            <div className="p-3 font-mono text-xs leading-relaxed bg-card text-muted-foreground rounded-sm m-2">
              {formatJsonSyntax(JSON.stringify(selectedRow, null, 2))}
            </div>
          </div>
        </div>
      </TabsContent>
    </Tabs>
  );
}

export function TableView({ connectionId, tableId }: TableViewProps) {
  const { data: columns } = useTableColumns(connectionId, tableId);
  const { data: indexes } = useTableIndexes(connectionId, tableId);

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="px-4 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Table2 className="size-4" />
          <span className="text-sm font-medium">{tableId}</span>
        </div>
      </div>

      <Tabs defaultValue="data" className="flex-1 flex flex-col min-h-0">
        <div className="px-4 pt-2 shrink-0">
          <TabsList>
            <TabsTrigger value="data" className="text-xs">
              Data
            </TabsTrigger>
            <TabsTrigger value="columns" className="text-xs">
              Columns
            </TabsTrigger>
            <TabsTrigger value="indexes" className="text-xs">
              Indexes
            </TabsTrigger>
            <TabsTrigger value="stats" className="text-xs">
              <Activity className="size-3 mr-1" />
              Stats
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="data" className="flex-1 p-4 pt-2 overflow-hidden min-h-0">
          <DataGrid connectionId={connectionId} tableId={tableId} />
        </TabsContent>

        <TabsContent value="columns" className="flex-1 p-4 pt-2 overflow-auto">
          <div className="border rounded-md">
            <Table className="text-xs">
              <TableHeader>
                <TableRow className="bg-muted/50" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}>
                  <TableHead className="px-3 py-1.5">Name</TableHead>
                  <TableHead className="px-3 py-1.5">Type</TableHead>
                  <TableHead className="px-3 py-1.5">Nullable</TableHead>
                  <TableHead className="px-3 py-1.5">Default</TableHead>
                  <TableHead className="px-3 py-1.5">Key</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {columns?.map((col) => (
                  <TableRow key={col.name} style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}>
                    <TableCell className="px-3 py-1.5 font-medium">{col.name}</TableCell>
                    <TableCell className="px-3 py-1.5 text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <span>{col.type}</span>
                        {col.isVector && (
                          <Badge variant="secondary" className="px-1 py-0 h-4 text-[10px]">
                            vector{col.vectorDimensions ? `(${col.vectorDimensions})` : ''}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="px-3 py-1.5">{col.nullable ? 'YES' : 'NO'}</TableCell>
                    <TableCell className="px-3 py-1.5 text-muted-foreground font-mono text-xs">
                      {col.default ?? <span className="italic">null</span>}
                    </TableCell>
                    <TableCell className="px-3 py-1.5">
                      <div className="flex items-center gap-1">
                        {col.primaryKey && <Key className="size-3 text-muted-foreground" />}
                        {col.foreignKey && (
                          <span className="text-xs text-muted-foreground">
                            &rarr; {col.foreignKey.table}({col.foreignKey.column})
                          </span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="indexes" className="flex-1 p-4 pt-2 overflow-auto">
          <div className="border rounded-md">
            <Table className="text-xs">
              <TableHeader>
                <TableRow className="bg-muted/50" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
                  <TableHead className="px-3 py-1.5">Name</TableHead>
                  <TableHead className="px-3 py-1.5">Columns</TableHead>
                  <TableHead className="px-3 py-1.5">Unique</TableHead>
                  <TableHead className="px-3 py-1.5">Method</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {indexes?.map((idx) => (
                  <TableRow key={idx.name} style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
                    <TableCell className="px-3 py-1.5 font-medium">
                      <div className="flex items-center gap-1">
                        {idx.primary && <Hash className="size-3 text-muted-foreground" />}
                        {idx.name}
                      </div>
                    </TableCell>
                    <TableCell className="px-3 py-1.5 text-muted-foreground">{idx.columns.join(', ')}</TableCell>
                    <TableCell className="px-3 py-1.5">{idx.unique ? 'YES' : 'NO'}</TableCell>
                    <TableCell className="px-3 py-1.5">
                      {idx.method ? (
                        <Badge variant={idx.method === 'hnsw' || idx.method === 'ivfflat' ? 'secondary' : 'outline'}>
                          {idx.method}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="stats" className="flex-1 overflow-auto">
          <TableStats connectionId={connectionId} tableId={tableId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
