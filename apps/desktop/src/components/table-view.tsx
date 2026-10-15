import { useCallback, useMemo, useReducer, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { debounce } from '@tanstack/pacer';
import { useTableColumns, useTableIndexes, usePreviewRows, useTables } from '@/hooks/use-schema';
import { useRunQuery } from '@/hooks/use-query';
import { useFieldVisibility } from '@/hooks/use-field-visibility';
import { TableStats } from '@/components/table-stats';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from 'cnfast';

import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { DataTable, type ColumnDef } from '@/components/data-table';
import { MiddleTruncate } from '@/components/middle-truncate';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import {
  Key,
  Hash,
  ChevronLeft,
  ChevronsLeft,
  ChevronRight,
  FileJson,
  Copy,
  Eye,
  Activity,
  Download,
  Ellipsis,
  Search,
  Filter,
  X,
  Trash2,
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { downloadResult, exportToJSON } from '@/lib/export';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { buildRowDeleteQuery, buildRowUpdateQuery } from '@/lib/table-editability';
import { toastError, toastSuccess } from '@/lib/toast';
import { RecordDetailTabs } from '@/components/record-detail-tabs';
import { ResultLimitNotice } from '@/components/result-limit-notice';
import { NativeCSVExportButton } from '@/components/native-csv-export-button';
import type { QueryResult } from '@kamehadb/shared';
import {
  INITIAL_PREVIEW_NAVIGATION,
  canAdvancePreview,
  canGoBackPreview,
  jumpPreviewPage,
  nextPreviewPage,
  previousPreviewPage,
  type PreviewNavigation,
} from '@/lib/preview-navigation';

type TableViewProps = {
  connectionId: string;
  tableId: string;
};

// Group offset/pageSize/selectedRow/search/sort state into one reducer so a
// single dispatch produces a single re-render instead of seven.
type DataGridState = {
  navigation: PreviewNavigation;
  pageSize: number;
  selectedRow: Record<string, unknown> | null;
  searchText: string;
  querySearch: string;
  searchColumn: string;
  matchCase: boolean;
  sortColumn: string;
  sortDirection: 'asc' | 'desc';
};

type DataGridAction =
  | { type: 'setOffset'; value: number }
  | { type: 'nextPage'; result: QueryResult; pending: boolean }
  | { type: 'previousPage' }
  | { type: 'setPageSize'; value: number }
  | { type: 'selectRow'; row: Record<string, unknown> | null }
  | { type: 'setSearchText'; value: string }
  | { type: 'setQuerySearch'; value: string }
  | { type: 'setSearchColumn'; value: string }
  | { type: 'setMatchCase'; value: boolean }
  | { type: 'setSortColumn'; value: string }
  | { type: 'setSortDirection'; value: 'asc' | 'desc' }
  | { type: 'cycleSort'; column: string }
  | { type: 'clearSort' };

// Ordering/search/size changes invalidate every bookmark, including the
// ascending-to-descending cycle; reusing an old key would skip or repeat rows.
function dataGridReducer(state: DataGridState, action: DataGridAction): DataGridState {
  const reset = { navigation: INITIAL_PREVIEW_NAVIGATION, selectedRow: null };
  switch (action.type) {
    case 'setOffset':
      return { ...state, navigation: jumpPreviewPage(action.value, state.pageSize), selectedRow: null };
    case 'nextPage':
      return {
        ...state,
        navigation: nextPreviewPage(state.navigation, action.result, action.pending),
        selectedRow: null,
      };
    case 'previousPage':
      return { ...state, navigation: previousPreviewPage(state.navigation, state.pageSize), selectedRow: null };
    case 'setPageSize':
      return { ...state, pageSize: action.value, ...reset };
    case 'selectRow':
      return { ...state, selectedRow: action.row };
    case 'setSearchText':
      return { ...state, searchText: action.value };
    case 'setQuerySearch':
      return { ...state, querySearch: action.value, ...reset };
    case 'setSearchColumn':
      return { ...state, searchColumn: action.value, ...reset };
    case 'setMatchCase':
      return { ...state, matchCase: action.value, ...reset };
    case 'setSortColumn':
      return { ...state, sortColumn: action.value, ...reset };
    case 'setSortDirection':
      return { ...state, sortDirection: action.value, ...reset };
    case 'cycleSort':
      if (state.sortColumn === action.column) {
        if (state.sortDirection === 'asc') return { ...state, sortDirection: 'desc' as const, ...reset };
        return { ...state, sortColumn: '', sortDirection: 'asc' as const, ...reset };
      }
      return { ...state, sortColumn: action.column, sortDirection: 'asc' as const, ...reset };
    case 'clearSort':
      return { ...state, sortColumn: '', sortDirection: 'asc' as const, ...reset };
  }
}

// Format query duration with sub-millisecond precision for fast queries (<1ms) or rounded integers otherwise. (How / Why / What)
function formatDuration(ms: number | undefined): string {
  if (ms === undefined || ms === null) return '<1ms';
  if (ms < 1) return '<1ms';
  return `${Math.round(ms)}ms`;
}

function DataGrid({ connectionId, tableId }: { connectionId: string; tableId: string }) {
  const [state, dispatch] = useReducer(dataGridReducer, {
    navigation: INITIAL_PREVIEW_NAVIGATION,
    pageSize: 50,
    selectedRow: null,
    searchText: '',
    querySearch: '',
    searchColumn: '',
    matchCase: false,
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
  const {
    data: result,
    isLoading,
    isFetching,
    isPlaceholderData,
  } = usePreviewRows(connectionId, {
    tableId,
    ...state.navigation.position,
    limit: state.pageSize,
    search: state.querySearch || undefined,
    searchColumn: state.searchColumn || undefined,
    matchCase: state.matchCase,
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

  // Only show the missing-PK warning after schema metadata has loaded,
  // because preview rows often arrive before columns and otherwise the UI
  // flashes a false "No primary key" state during the first render.
  const showNoPrimaryKeyWarning = !isLoadingColumns && !!columns && pkColumns.length === 0 && !isView;

  const offset = state.navigation.position.offset;
  const page = state.navigation.pageIndex + 1;
  const pendingPage = isFetching || isPlaceholderData;
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

  const [rowToDelete, setRowToDelete] = useState<Record<string, unknown> | null>(null);

  // Construct and execute DELETE query for selected row using primary keys to avoid ambiguous row removal. (How / Why / What)
  const handleDeleteRow = useCallback(
    (row: Record<string, unknown>) => {
      if (isView) {
        toastError('This is a view — rows cannot be deleted');
        return;
      }
      if (pkColumns.length === 0) {
        toastError('Cannot delete row: table has no primary key');
        return;
      }
      const sql = buildRowDeleteQuery({
        tableId,
        row,
        pkColumns,
        allColumnNames: displayColumnNames,
      });

      runQuery.mutate(
        { query: sql },
        {
          onSuccess: () => {
            toastSuccess('Row deleted successfully');
            queryClient.invalidateQueries({ queryKey: ['previewRows', connectionId, tableId] });
          },
          onError: (err) => {
            console.error('Failed to delete row:', err);
            toastError(err instanceof Error ? err.message : 'Failed to delete row');
          },
        },
      );
    },
    [isView, pkColumns, tableId, displayColumnNames, runQuery, queryClient, connectionId],
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
            onDoubleClick={
              pkColumns.length > 0 && !isView ? () => setEditingCell({ rowIndex, column: col.name }) : undefined
            }
            className={
              pkColumns.length > 0 && !isView
                ? 'cursor-pointer flex-1 min-w-0 flex items-center overflow-hidden'
                : 'flex-1 min-w-0 flex items-center overflow-hidden'
            }
          >
            {value === null ? (
              <span className="text-muted-foreground italic">null</span>
            ) : value === undefined ? (
              <span className="text-muted-foreground">-</span>
            ) : typeof value === 'object' ? (
              <MiddleTruncate text={JSON.stringify(value)} className="text-primary font-mono" />
            ) : (
              <MiddleTruncate text={String(value)} />
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
      <ResultLimitNotice result={result} />
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
      <div className="min-h-0 flex-1 flex flex-col border border-border rounded-md overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2 shrink-0">
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
              <Input
                value={state.searchText}
                onChange={(e) => {
                  dispatch({ type: 'setSearchText', value: e.target.value });
                  debouncedSearchFn(e.target.value);
                }}
                placeholder={state.searchColumn ? `Search in ${state.searchColumn}...` : 'Search all fields...'}
                className="h-7 pl-7 pr-7 text-xs md:text-xs rounded-lg border-input"
              />
              {state.searchText && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    dispatch({ type: 'setSearchText', value: '' });
                    dispatch({ type: 'setQuerySearch', value: '' });
                  }}
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground hover:text-foreground"
                  title="Clear search"
                >
                  <X className="size-3" />
                </Button>
              )}
            </div>
            {/* Match-case toggle matches the input height (28px), border-input color, and rounded-lg radius. (Why) */}
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => dispatch({ type: 'setMatchCase', value: !state.matchCase })}
              className={cn(
                'size-7 shrink-0 rounded-lg border font-mono text-xs transition-colors',
                state.matchCase
                  ? 'border-primary/50 bg-primary/15 text-primary font-medium'
                  : 'border-input bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
              title={state.matchCase ? 'Match case: ON (Case-sensitive)' : 'Match case: OFF (Case-insensitive)'}
            >
              Aa
            </Button>
            {/* Explicitly pass the friendly label as children to SelectValue so Base UI's
                unmounted dropdown doesn't leak the raw __ALL__ sentinel value to the button. (How / Why / What) */}
            <Select
              value={state.searchColumn || '__ALL__'}
              onValueChange={(v) => dispatch({ type: 'setSearchColumn', value: v === '__ALL__' ? '' : (v ?? '') })}
            >
              <SelectTrigger
                size="sm"
                className="h-7 min-w-[7.5rem] max-w-[12rem] text-xs gap-1.5 px-2 shrink-0 rounded-lg border-input"
                title="Filter by column"
              >
                <Filter className="size-3 text-muted-foreground shrink-0" />
                <SelectValue placeholder="All fields">{state.searchColumn || 'All fields'}</SelectValue>
              </SelectTrigger>
              <SelectContent side="bottom" align="start" alignItemWithTrigger={false} className="max-h-64 min-w-[9rem]">
                <SelectItem value="__ALL__" className="text-xs py-1">
                  All fields
                </SelectItem>
                {displayColumns.map((col) => (
                  <SelectItem key={col.name} value={col.name} className="text-xs py-1">
                    {col.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DataTable
          rows={result.rows}
          columns={tableColumns}
          rowKey={(_, i) => String(i)}
          suffixHeader=""
          suffixWidth="64px"
          showIndex
          indexOffset={offset}
          stickyHeader
          onSortChange={(col) => dispatch({ type: 'cycleSort', column: col })}
          sortColumn={state.sortColumn}
          sortDirection={state.sortDirection}
          suffix={(row) => (
            <div
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            >
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={(e) => e.stopPropagation()}
                      aria-label="Row actions"
                    />
                  }
                >
                  <Ellipsis className="size-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent side="left" align="start" sideOffset={4} className="w-40">
                  <DropdownMenuItem onClick={() => dispatch({ type: 'selectRow', row })}>
                    <Eye className="size-3.5 mr-2" />
                    View details
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    // Catch webview or permission failures so row copy never becomes an unhandled rejection.
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(JSON.stringify(row, null, 2));
                      } catch {
                        toastError('Failed to copy row to clipboard');
                      }
                    }}
                  >
                    <Copy className="size-3.5 mr-2" />
                    Copy row
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setRowToDelete(row)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="size-3.5 mr-2" />
                    Delete row
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
          className="text-xs"
        />
        {result && (
          <div className="shrink-0 px-3 py-1.5 text-xs text-muted-foreground border-t bg-muted/30 flex flex-nowrap items-center gap-2 rounded-b-md">
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
            <span className="min-w-0 truncate">
              {result.rows.length > 0 ? `Rows ${offset + 1}–${offset + result.rows.length}` : 'No rows'}
            </span>
            {/* The duration describes the rows on screen, so it sits next to the count, not the pager. (Why) */}
            <span className="text-muted-foreground/70">{formatDuration(result.durationMs)}</span>
            <div className="ml-auto flex items-center gap-2">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <span>Page</span>
                {result.paginationMode === 'keyset' ? (
                  <span>{page}</span>
                ) : (
                  <Input
                    type="number"
                    min={1}
                    value={page}
                    disabled={pendingPage}
                    aria-label="Jump to offset page"
                    onChange={(e) => {
                      const p = Number(e.target.value);
                      const target = (p - 1) * state.pageSize;
                      if (Number.isSafeInteger(p) && p >= 1 && Number.isSafeInteger(target)) {
                        dispatch({ type: 'setOffset', value: target });
                      }
                    }}
                    className="h-7 w-14 text-xs text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="First page"
                  title="First page"
                  disabled={pendingPage || offset === 0}
                  onClick={() => dispatch({ type: 'setOffset', value: 0 })}
                >
                  <ChevronsLeft className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Previous page"
                  disabled={pendingPage || !canGoBackPreview(state.navigation)}
                  onClick={() => dispatch({ type: 'previousPage' })}
                >
                  <ChevronLeft className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Next page"
                  disabled={!canAdvancePreview(result, pendingPage)}
                  onClick={() => dispatch({ type: 'nextPage', result, pending: pendingPage })}
                >
                  <ChevronRight className="size-3.5" />
                </Button>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="ghost" size="icon-sm" className="h-7 w-7" title="Export displayed rows" />}
              >
                <Download className="size-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  // Show success only after the clipboard promise resolves, and surface failures to the user.
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(exportToJSON(result));
                      toastSuccess('JSON copied to clipboard');
                    } catch {
                      toastError('Failed to copy JSON to clipboard');
                    }
                  }}
                >
                  Copy as JSON
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void downloadResult(result, 'csv')}>Export as CSV</DropdownMenuItem>
                <DropdownMenuItem onClick={() => void downloadResult(result, 'json')}>Export as JSON</DropdownMenuItem>
                <DropdownMenuItem onClick={() => void downloadResult(result, 'sql')}>Export as SQL</DropdownMenuItem>
                <DropdownMenuSeparator />
                <NativeCSVExportButton connectionId={connectionId} tableId={tableId} asMenuItem />
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
              Record #{state.selectedRow && result ? offset + result.rows.indexOf(state.selectedRow) + 1 : ''}
            </SheetTitle>
          </SheetHeader>
          <RecordDetailTabs selectedRow={state.selectedRow} />
        </SheetContent>
      </Sheet>

      <Dialog open={!!rowToDelete} onOpenChange={(open) => !open && setRowToDelete(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete row</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this row from <span className="font-mono text-foreground">{tableId}</span>
              ? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setRowToDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (rowToDelete) {
                  handleDeleteRow(rowToDelete);
                  setRowToDelete(null);
                }
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function TableView({ connectionId, tableId }: TableViewProps) {
  const { data: columns } = useTableColumns(connectionId, tableId);
  const { data: indexes } = useTableIndexes(connectionId, tableId);

  return (
    <div className="flex flex-col h-full bg-background">
      <Tabs defaultValue="data" className="flex-1 flex flex-col min-h-0">
        <div className="px-4 pt-1 shrink-0">
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

        <TabsContent value="data" className="flex-1 px-4 pb-3 pt-1 overflow-hidden min-h-0">
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
                          <Badge variant="secondary" className="px-1 py-0 h-4 text-[11px]">
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
