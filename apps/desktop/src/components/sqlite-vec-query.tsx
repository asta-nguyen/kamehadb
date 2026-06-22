import { useEffect, useMemo, useReducer } from 'react';
import type { WorkspaceTab } from '@kamehadb/shared';
import { useSqliteVecCapabilities, useSqliteVecSearch, useSqliteVecSample } from '@/hooks/use-sqlite-vec';
import { parseVectorText } from '@/lib/postgres-vector';
import { PostgresVectorResults } from '@/components/postgres-vector-results';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dice5, Loader2, Network, Play } from 'lucide-react';
import { openSqliteVecMapTab } from '@/store';

type SqliteVecState = {
  readonly table: string;
  readonly column: string;
  readonly vectorText: string;
  readonly sampledVector: number[] | null;
  readonly filterColumn: string;
  readonly filterOp: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'LIKE';
  readonly filterValue: string;
  readonly metric: 'cosine' | 'l2' | 'inner_product';
  readonly limit: number;
  readonly running: boolean;
  readonly error: string | null;
  readonly info: string | null;
  readonly result: import('@kamehadb/shared').SqliteVecSearchResult | null;
};

type SqliteVecAction =
  | { type: 'setTable'; value: string }
  | { type: 'setColumn'; value: string }
  | { type: 'setVectorText'; value: string }
  | { type: 'setSampledVector'; vector: number[]; display: string }
  | { type: 'setFilterColumn'; value: string }
  | { type: 'setFilterOp'; value: SqliteVecState['filterOp'] }
  | { type: 'setFilterValue'; value: string }
  | { type: 'setMetric'; value: 'cosine' | 'l2' | 'inner_product' }
  | { type: 'setLimit'; value: number }
  | { type: 'startRun' }
  | { type: 'finishRun'; result: import('@kamehadb/shared').SqliteVecSearchResult; info?: string }
  | { type: 'failRun'; error: string }
  | { type: 'endRun' }
  | { type: 'setError'; value: string | null };

function sqliteVecReducer(state: SqliteVecState, action: SqliteVecAction): SqliteVecState {
  switch (action.type) {
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

interface SqliteVecQueryProps {
  readonly tab: Extract<WorkspaceTab, { type: 'sqlite-vec-search' }>;
  readonly connectionId: string;
}

export function SqliteVecQuery({ tab, connectionId }: SqliteVecQueryProps) {
  const { data: capabilities } = useSqliteVecCapabilities(connectionId);
  const vectorSearch = useSqliteVecSearch(connectionId);
  const sampleVector = useSqliteVecSample(connectionId);

  const [state, dispatch] = useReducer(sqliteVecReducer, {
    table: tab.table ?? '',
    column: tab.column ?? '',
    vectorText: tab.vectorText ?? '',
    sampledVector: null,
    filterColumn: '',
    filterOp: '=',
    filterValue: '',
    metric: 'cosine',
    limit: 10,
    running: false,
    error: null,
    info: null,
    result: null,
  });

  const metadataColumns = useMemo(() => {
    if (!capabilities?.metadataColumns || !state.table) return [];
    return capabilities.metadataColumns[state.table] ?? [];
  }, [capabilities, state.table]);

  const vectorTables = useMemo(() => {
    if (!capabilities?.columns) return [];
    return [...new Set(capabilities.columns.map((column) => column.tableName))].sort();
  }, [capabilities]);

  const vectorColumns = useMemo(() => {
    if (!capabilities?.columns || !state.table) return [];
    return capabilities.columns
      .filter((column) => column.tableName === state.table)
      .sort((a, b) => a.columnName.localeCompare(b.columnName));
  }, [capabilities, state.table]);

  useEffect(() => {
    if (!state.table && vectorTables.length > 0) {
      dispatch({ type: 'setTable', value: vectorTables[0] });
    }
  }, [vectorTables, state.table]);

  useEffect(() => {
    if (!state.column && vectorColumns.length > 0) {
      dispatch({ type: 'setColumn', value: vectorColumns[0].columnName });
    }
  }, [state.column, vectorColumns]);

  const run = async () => {
    dispatch({ type: 'setError', value: null });
    if (!state.table || !state.column) {
      dispatch({ type: 'setError', value: 'Select a table and vector column' });
      return;
    }

    dispatch({ type: 'startRun' });
    try {
      let vector: number[];
      if (state.sampledVector) {
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

      const dims = vectorColumns.find((value) => value.columnName === state.column)?.dimensions ?? 0;
      if (dims > 0 && vector.length !== dims) {
        dispatch({
          type: 'setError',
          value: `Vector dimension mismatch: expected ${dims}, got ${vector.length}`,
        });
        dispatch({ type: 'endRun' });
        return;
      }

      // Build filter clause from structured fields
      let filter: string | undefined;
      if (state.filterColumn && state.filterValue.trim()) {
        const val =
          state.filterOp === 'LIKE'
            ? `'${state.filterValue.replace(/'/g, "''")}'`
            : isNaN(Number(state.filterValue))
              ? `'${state.filterValue.replace(/'/g, "''")}'`
              : state.filterValue;
        filter = `"${state.filterColumn}" ${state.filterOp} ${val}`;
      }

      const result = await vectorSearch.mutateAsync({
        table: state.table,
        column: state.column,
        vector,
        filter,
        metric: state.metric,
        limit: state.limit,
      });
      dispatch({ type: 'finishRun', result });
    } catch (error) {
      dispatch({ type: 'failRun', error: error instanceof Error ? error.message : 'Search failed' });
    }
  };

  const emptyMessage =
    capabilities && !capabilities.available
      ? 'sqlite-vec extension is not loaded in this database.'
      : capabilities && capabilities.columns.length === 0
        ? 'No vec0 virtual tables found in this database.'
        : 'Enter a query vector and run a search';

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Select
            value={state.table || ''}
            onValueChange={(value) => dispatch({ type: 'setTable', value: value ?? '' })}
          >
            <SelectTrigger size="sm" className="h-7 text-xs w-40">
              <SelectValue placeholder="Table…" />
            </SelectTrigger>
            <SelectContent>
              {vectorTables.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={state.column || ''}
            onValueChange={(value) => dispatch({ type: 'setColumn', value: value ?? '' })}
          >
            <SelectTrigger size="sm" className="h-7 text-xs w-40">
              <SelectValue placeholder="Vector column…" />
            </SelectTrigger>
            <SelectContent>
              {vectorColumns.map((value) => (
                <SelectItem key={value.columnName} value={value.columnName}>
                  {value.columnName} ({value.dimensions}d)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={state.metric}
            onValueChange={(value) =>
              dispatch({ type: 'setMetric', value: value as 'cosine' | 'l2' | 'inner_product' })
            }
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

          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              if (!state.table || !state.column) return;
              dispatch({ type: 'setError', value: null });
              try {
                const result = await sampleVector.mutateAsync({ table: state.table, column: state.column });
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
                  value: err instanceof Error ? err.message : 'Failed to sample vector',
                });
              }
            }}
            disabled={sampleVector.isPending || !state.table || !state.column}
            className="ml-auto"
          >
            {sampleVector.isPending ? (
              <Loader2 className="size-3.5 mr-1.5 animate-spin" />
            ) : (
              <Dice5 className="size-3.5 mr-1.5" />
            )}
            Sample
          </Button>

          <Button size="sm" onClick={run} disabled={state.running}>
            {state.running ? (
              <Loader2 className="size-3.5 mr-1.5 animate-spin" />
            ) : (
              <Play className="size-3.5 mr-1.5" />
            )}
            Search
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              state.table &&
              state.column &&
              openSqliteVecMapTab(connectionId, { table: state.table, column: state.column })
            }
            disabled={!state.table || !state.column}
          >
            <Network className="size-3.5 mr-1.5" />
            Map
          </Button>
        </div>

        <Textarea
          value={state.vectorText}
          onChange={(event) => dispatch({ type: 'setVectorText', value: event.target.value })}
          placeholder="[0.1, 0.2, 0.3, ...]"
          spellCheck={false}
          className="w-full min-h-20 px-2 py-1 text-xs font-mono bg-background border rounded resize-y"
        />

        <div className="flex items-center gap-2 flex-wrap">
          <Select
            value={state.filterColumn || '__none__'}
            onValueChange={(value) =>
              dispatch({ type: 'setFilterColumn', value: (value ?? '') === '__none__' ? '' : (value ?? '') })
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
                onValueChange={(value) => dispatch({ type: 'setFilterOp', value: value as SqliteVecState['filterOp'] })}
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

        {state.error && <div className="text-xs text-destructive">{state.error}</div>}
        {state.info && !state.error && <div className="text-xs text-muted-foreground">{state.info}</div>}
      </div>

      <div className="flex-1 overflow-auto min-h-0 p-4">
        {state.result ? (
          <PostgresVectorResults result={state.result} />
        ) : (
          <div className="p-3 text-sm text-muted-foreground">{emptyMessage}</div>
        )}
      </div>
    </div>
  );
}
