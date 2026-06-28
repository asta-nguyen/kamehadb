import { useEffect, useMemo, useReducer } from 'react';
import type { WorkspaceTab } from '@/lib/types';
import type { PostgresVectorSearchResult } from '@kamehadb/shared';
import { safeErrorMessage } from '@kamehadb/shared';
import { usePostgresVectorCapabilities, usePostgresVectorSearch } from '@/hooks/use-postgres-vector';
import { useSqliteVecCapabilities, useSqliteVecSearch, useSqliteVecSample } from '@/hooks/use-sqlite-vec';
import { parseVectorText } from '@/lib/postgres-vector';
import { PostgresVectorResults } from '@/components/postgres-vector-results';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dice5, Loader2, Network, Play } from 'lucide-react';
import { openPostgresVectorMapTab, openSqliteVecMapTab } from '@/store';
import { appendFrontendLog } from '@/lib/app-logs';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';

// ── State type (superset of both PG and sqlite-vec fields) ────────────────

type VectorQueryState = {
  readonly schema: string;
  readonly table: string;
  readonly column: string;
  readonly vectorText: string;
  readonly sampledVector: number[] | null;
  readonly filterColumn: string;
  readonly filterOp: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'LIKE';
  readonly filterValue: string;
  readonly filterText: string;
  readonly metric: 'cosine' | 'l2' | 'inner_product';
  readonly limit: number;
  readonly running: boolean;
  readonly error: string | null;
  readonly info: string | null;
  readonly result: PostgresVectorSearchResult | null;
};

type VectorQueryAction =
  | { type: 'setSchema'; value: string }
  | { type: 'setTable'; value: string }
  | { type: 'setColumn'; value: string }
  | { type: 'setVectorText'; value: string }
  | { type: 'setSampledVector'; vector: number[]; display: string }
  | { type: 'setFilterColumn'; value: string }
  | { type: 'setFilterOp'; value: VectorQueryState['filterOp'] }
  | { type: 'setFilterValue'; value: string }
  | { type: 'setFilterText'; value: string }
  | { type: 'setMetric'; value: VectorQueryState['metric'] }
  | { type: 'setLimit'; value: number }
  | { type: 'startRun' }
  | { type: 'finishRun'; result: PostgresVectorSearchResult; info?: string }
  | { type: 'failRun'; error: string }
  | { type: 'endRun' }
  | { type: 'setError'; value: string | null };

function vectorQueryReducer(state: VectorQueryState, action: VectorQueryAction): VectorQueryState {
  switch (action.type) {
    case 'setSchema':
      return { ...state, schema: action.value, table: '', column: '', result: null, info: null, error: null };
    case 'setTable':
      return { ...state, table: action.value, column: '', result: null, info: null, error: null };
    case 'setColumn':
      return { ...state, column: action.value, result: null, info: null, error: null };
    case 'setVectorText':
      return { ...state, vectorText: action.value, sampledVector: null };
    case 'setSampledVector':
      return { ...state, vectorText: action.display, sampledVector: action.vector };
    case 'setFilterColumn':
      return { ...state, filterColumn: action.value };
    case 'setFilterOp':
      return { ...state, filterOp: action.value };
    case 'setFilterValue':
      return { ...state, filterValue: action.value };
    case 'setFilterText':
      return { ...state, filterText: action.value };
    case 'setMetric':
      return { ...state, metric: action.value };
    case 'setLimit':
      return { ...state, limit: action.value };
    case 'startRun':
      return { ...state, running: true, error: null, info: null };
    case 'finishRun':
      return { ...state, running: false, result: action.result, info: action.info ?? null };
    case 'failRun':
      return { ...state, running: false, error: action.error };
    case 'endRun':
      return { ...state, running: false };
    case 'setError':
      return { ...state, error: action.value };
  }
}

// ── Helpers to read PG-specific fields from the tab ──────────────────────

function getPgSchema(tab: WorkspaceTab): string {
  return tab.type === 'postgres-vector-search' ? (tab.schema ?? '') : '';
}

function tabDisplayName(tab: WorkspaceTab): string {
  return tab.type === 'postgres-vector-search' ? 'pgvector' : 'sqlite-vec';
}

// ── Component ─────────────────────────────────────────────────────────────

interface VectorQueryProps {
  readonly tab: Extract<WorkspaceTab, { type: 'postgres-vector-search' | 'sqlite-vec-search' }>;
  readonly connectionId: string;
}

export function VectorQuery({ tab, connectionId }: VectorQueryProps) {
  const isSqlite = tab.type === 'sqlite-vec-search';

  // Hooks — only the active engine's hooks are enabled
  const { data: pgCapabilities } = usePostgresVectorCapabilities(isSqlite ? null : connectionId);
  const pgSearch = usePostgresVectorSearch(isSqlite ? null : connectionId);
  const { data: sqliteCapabilities } = useSqliteVecCapabilities(isSqlite ? connectionId : null);
  const sqliteSearch = useSqliteVecSearch(isSqlite ? connectionId : null);
  const sqliteSample = useSqliteVecSample(isSqlite ? connectionId : null);

  const capabilities = isSqlite ? sqliteCapabilities : pgCapabilities;

  const [state, dispatch] = useReducer(vectorQueryReducer, {
    schema: getPgSchema(tab),
    table: tab.table ?? '',
    column: tab.column ?? '',
    vectorText: tab.vectorText ?? '',
    sampledVector: null,
    filterColumn: '',
    filterOp: '=',
    filterValue: '',
    filterText: '',
    metric: 'cosine',
    limit: 10,
    running: false,
    error: null,
    info: null,
    result: null,
  });

  // ── Derived lists ─────────────────────────────────────────────────

  const schemas = useMemo(() => {
    if (isSqlite || !capabilities?.columns) return [];
    return [...new Set(capabilities.columns.map((c) => (c as { tableSchema: string }).tableSchema))].sort();
  }, [capabilities, isSqlite]);

  const vectorTables = useMemo(() => {
    if (!capabilities?.columns) return [];
    return [
      ...new Set(
        capabilities.columns.map((c) => {
          const col = c as { tableName: string; tableSchema?: string };
          return isSqlite ? col.tableName : `${col.tableName}`;
        }),
      ),
    ].sort();
  }, [capabilities, isSqlite]);

  const vectorColumns = useMemo(() => {
    if (!capabilities?.columns || !state.table) return [];
    return (
      capabilities.columns as Array<{
        columnName: string;
        dimensions: number;
        tableName: string;
        tableSchema?: string;
      }>
    )
      .filter((col) =>
        isSqlite ? col.tableName === state.table : col.tableName === state.table && col.tableSchema === state.schema,
      )
      .sort((a, b) => a.columnName.localeCompare(b.columnName));
  }, [capabilities, state.schema, state.table, isSqlite]);

  const metadataColumns = useMemo(() => {
    if (!isSqlite || !capabilities) return [];
    const sqliteCap = capabilities as { metadataColumns?: Record<string, string[]> };
    if (!sqliteCap.metadataColumns || !state.table) return [];
    return sqliteCap.metadataColumns[state.table] ?? [];
  }, [capabilities, state.table, isSqlite]);

  // ── Auto-select effects ───────────────────────────────────────────

  // PG: auto-select first schema
  useEffect(() => {
    if (!isSqlite && !state.schema && schemas.length > 0) {
      dispatch({ type: 'setSchema', value: schemas[0] });
    }
  }, [isSqlite, schemas, state.schema]);

  // Both: auto-select first table
  useEffect(() => {
    if (!state.table && vectorTables.length > 0) {
      dispatch({ type: 'setTable', value: vectorTables[0] });
    }
  }, [state.table, vectorTables]);

  // Both: auto-select first column
  useEffect(() => {
    if (!state.column && vectorColumns.length > 0) {
      dispatch({ type: 'setColumn', value: vectorColumns[0].columnName });
    }
  }, [state.column, vectorColumns]);

  // ── Search runner ─────────────────────────────────────────────────

  const run = async () => {
    dispatch({ type: 'setError', value: null });
    if (!state.table || !state.column) {
      dispatch({ type: 'setError', value: 'Select a table and vector column' });
      return;
    }

    dispatch({ type: 'startRun' });
    try {
      // Resolve vector — sampled (sqlite-vec) or parsed from text
      let vector: number[];
      if (isSqlite && state.sampledVector) {
        vector = state.sampledVector;
      } else {
        try {
          vector = parseVectorText(state.vectorText);
        } catch (error) {
          dispatch({ type: 'setError', value: error instanceof Error ? error.message : 'Invalid query vector' });
          dispatch({ type: 'endRun' });
          return;
        }
      }

      // Validate dimensions
      const dims = vectorColumns.find((c) => c.columnName === state.column)?.dimensions ?? 0;
      if (dims > 0 && vector.length !== dims) {
        dispatch({
          type: 'setError',
          value: `Vector dimension mismatch: expected ${dims}, got ${vector.length}`,
        });
        dispatch({ type: 'endRun' });
        return;
      }

      // Build filter clause
      let filter: string | undefined;
      if (isSqlite) {
        // Structured filter — column + op + value
        if (state.filterColumn && state.filterValue.trim()) {
          const val =
            state.filterOp === 'LIKE'
              ? `'${state.filterValue.replace(/'/g, "''")}'`
              : isNaN(Number(state.filterValue))
                ? `'${state.filterValue.replace(/'/g, "''")}'`
                : state.filterValue;
          filter = `"${state.filterColumn}" ${state.filterOp} ${val}`;
        }
      } else {
        // Free-text SQL WHERE clause
        filter = state.filterText.trim() || undefined;
      }

      // Execute search — input shapes differ between engines
      const result: PostgresVectorSearchResult = isSqlite
        ? await sqliteSearch.mutateAsync({
            table: state.table,
            column: state.column,
            vector,
            filter,
            metric: state.metric,
            limit: state.limit,
          })
        : await pgSearch.mutateAsync({
            schema: state.schema || undefined,
            table: state.table,
            column: state.column,
            vector,
            filter,
            metric: state.metric,
            limit: state.limit,
          });

      dispatch({ type: 'finishRun', result });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Search failed';
      dispatch({ type: 'failRun', error: message });
      void appendFrontendLog({
        level: 'error',
        scope: 'vector-query.run',
        message: `Vector search failed: ${message}`,
        details: error instanceof Error ? error.stack : String(error),
      });
    }
  };

  // ── Empty state message ───────────────────────────────────────────

  const emptyMessage =
    capabilities && !capabilities.available
      ? `${tabDisplayName(tab)} extension is not ${isSqlite ? 'loaded in' : 'installed on'} this database.`
      : capabilities && capabilities.columns.length === 0
        ? isSqlite
          ? 'No vec0 virtual tables found in this database.'
          : 'No vector columns found in this database.'
        : 'Enter a query vector and run a search';

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border space-y-2">
        {/* Engine-agnostic control row: schema (PG), table, column, metric, limit, sample (SQLite), search, map */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Schema selector — PG only */}
          {!isSqlite && (
            <Select
              value={state.schema || ''}
              onValueChange={(value) => dispatch({ type: 'setSchema', value: value ?? '' })}
            >
              <SelectTrigger size="sm" className="h-7 text-xs w-28">
                <SelectValue placeholder="Schema…" />
              </SelectTrigger>
              <SelectContent>
                {schemas.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Table selector */}
          <Select
            value={state.table || ''}
            onValueChange={(value) => dispatch({ type: 'setTable', value: value ?? '' })}
          >
            <SelectTrigger size="sm" className="h-7 text-xs w-40">
              <SelectValue placeholder="Table…" />
            </SelectTrigger>
            <SelectContent>
              {vectorTables.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Column selector */}
          <Select
            value={state.column || ''}
            onValueChange={(value) => dispatch({ type: 'setColumn', value: value ?? '' })}
          >
            <SelectTrigger size="sm" className="h-7 text-xs w-40">
              <SelectValue placeholder="Vector column…" />
            </SelectTrigger>
            <SelectContent>
              {vectorColumns.map((c) => (
                <SelectItem key={c.columnName} value={c.columnName}>
                  {c.columnName} ({c.dimensions}d)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Metric selector */}
          <Select
            value={state.metric}
            onValueChange={(value) => dispatch({ type: 'setMetric', value: value as VectorQueryState['metric'] })}
          >
            <SelectTrigger size="sm" className="h-7 text-xs w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cosine">Cosine</SelectItem>
              <SelectItem value="l2">L2 Distance</SelectItem>
              <SelectItem value="inner_product">Inner Product</SelectItem>
            </SelectContent>
          </Select>

          {/* Limit selector */}
          <Select
            value={String(state.limit)}
            onValueChange={(value) => dispatch({ type: 'setLimit', value: Number(value) })}
          >
            <SelectTrigger size="sm" className="h-7 text-xs w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="5">5</SelectItem>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>

          {/* Sample vector button — SQLite only */}
          {isSqlite && (
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                if (!state.table || !state.column) return;
                dispatch({ type: 'setError', value: null });
                try {
                  const result = await sqliteSample.mutateAsync({ table: state.table, column: state.column });
                  const preview = result.vector.slice(0, 8);
                  const display =
                    preview.length < result.vector.length
                      ? `[${preview.join(', ')}, ...] // ${result.dimensions}d`
                      : `[${preview.join(', ')}]`;
                  dispatch({ type: 'setSampledVector', vector: result.vector, display });
                  dispatch({ type: 'setError', value: null });
                } catch (err) {
                  dispatch({
                    type: 'setError',
                    value: safeErrorMessage(err, 'Failed to sample vector'),
                  });
                }
              }}
              disabled={sqliteSample.isPending || !state.table || !state.column}
              className="ml-auto"
            >
              {sqliteSample.isPending ? (
                <Loader2 className="size-3.5 mr-1.5 animate-spin" />
              ) : (
                <Dice5 className="size-3.5 mr-1.5" />
              )}
              Sample
            </Button>
          )}

          {/* Search button */}
          <Button size="sm" onClick={run} disabled={state.running}>
            {state.running ? (
              <Loader2 className="size-3.5 mr-1.5 animate-spin" />
            ) : (
              <Play className="size-3.5 mr-1.5" />
            )}
            Search
          </Button>

          {/* Map button — opens 3D vector map */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (!state.table || !state.column) return;
              if (isSqlite) {
                openSqliteVecMapTab(connectionId, { table: state.table, column: state.column });
              } else {
                openPostgresVectorMapTab(connectionId, {
                  schema: state.schema,
                  table: state.table,
                  column: state.column,
                });
              }
            }}
            disabled={!state.table || !state.column}
          >
            <Network className="size-3.5 mr-1.5" />
            Map
          </Button>
        </div>

        {/* Vector text input */}
        <Textarea
          value={state.vectorText}
          onChange={(event) => dispatch({ type: 'setVectorText', value: event.target.value })}
          placeholder="[0.1, 0.2, 0.3, ...]"
          spellCheck={false}
          className="w-full min-h-20 px-2 py-1 text-xs font-mono bg-background border rounded resize-y"
        />

        {/* Filter section — differs by engine */}
        {isSqlite ? (
          <div className="flex items-center gap-2 flex-wrap">
            <Select
              value={state.filterColumn || '__none__'}
              onValueChange={(value) =>
                dispatch({
                  type: 'setFilterColumn',
                  value: (value ?? '') === '__none__' ? '' : (value ?? ''),
                })
              }
            >
              <SelectTrigger size="sm" className="h-7 text-xs w-32">
                <SelectValue placeholder="No filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No filter</SelectItem>
                {metadataColumns.map((col) => (
                  <SelectItem key={col} value={col}>
                    {col}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {state.filterColumn && (
              <>
                <Select
                  value={state.filterOp}
                  onValueChange={(value) =>
                    dispatch({ type: 'setFilterOp', value: value as VectorQueryState['filterOp'] })
                  }
                >
                  <SelectTrigger size="sm" className="h-7 text-xs w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="=">=</SelectItem>
                    <SelectItem value="!=">&ne;</SelectItem>
                    <SelectItem value=">">&gt;</SelectItem>
                    <SelectItem value="<">&lt;</SelectItem>
                    <SelectItem value=">=">&ge;</SelectItem>
                    <SelectItem value="<=">&le;</SelectItem>
                    <SelectItem value="LIKE">LIKE</SelectItem>
                  </SelectContent>
                </Select>

                <Input
                  value={state.filterValue}
                  onChange={(event) => dispatch({ type: 'setFilterValue', value: event.target.value })}
                  placeholder="Value…"
                  className="h-7 w-32 px-2 text-xs bg-background border rounded"
                />
              </>
            )}
          </div>
        ) : (
          <Input
            value={state.filterText}
            onChange={(event) => dispatch({ type: 'setFilterText', value: event.target.value })}
            placeholder="Optional filter, e.g. category = 'docs' AND id > 10"
            className="w-full h-7 px-2 text-xs bg-background border rounded"
          />
        )}

        {/* Error / info display */}
        {state.error && <ErrorState compact error={new Error(state.error)} />}
        {state.info && !state.error && <div className="text-xs text-muted-foreground">{state.info}</div>}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-auto min-h-0 p-4">
        {state.result ? (
          <PostgresVectorResults
            result={state.result}
            onViewMap={
              isSqlite
                ? undefined
                : () => {
                    if (!state.schema || !state.table || !state.column) return;
                    openPostgresVectorMapTab(connectionId, {
                      schema: state.schema,
                      table: state.table,
                      column: state.column,
                    });
                  }
            }
          />
        ) : (
          <EmptyState title={emptyMessage} />
        )}
      </div>
    </div>
  );
}
