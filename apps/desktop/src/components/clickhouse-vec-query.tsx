import { useEffect, useMemo, useReducer } from 'react';
import type { WorkspaceTab } from '@/lib/types';
import type { ClickHouseVectorSearchResult } from '@kamehadb/shared';
import { safeErrorMessage } from '@kamehadb/shared';
import {
  useClickHouseVectorCapabilities,
  useClickHouseVectorSearch,
  useClickhouseVecSample,
} from '@/hooks/use-clickhouse-vec';
import { parseVectorText } from '@/lib/postgres-vector';
import { PostgresVectorResults } from '@/components/postgres-vector-results';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dice5, Loader2, Network, Play } from 'lucide-react';
import { appendFrontendLog } from '@/lib/app-logs';
import { openClickhouseVecMapTab } from '@/store';
import type { PostgresVectorSearchResult } from '@kamehadb/shared';

function clampLimit(value: number): number {
  return Math.min(1000, Math.max(1, value));
}

type ClickHouseVecQueryState = {
  readonly table: string;
  readonly column: string;
  readonly vectorText: string;
  readonly sampledVector: number[] | null;
  readonly metric: 'cosine' | 'l2' | 'inner_product';
  readonly limit: number;
  readonly running: boolean;
  readonly error: string | null;
  readonly result: PostgresVectorSearchResult | null;
};

type ClickHouseVecQueryAction =
  | { type: 'setTable'; value: string }
  | { type: 'setColumn'; value: string }
  | { type: 'setVectorText'; value: string }
  | { type: 'setSampledVector'; vector: number[]; display: string }
  | { type: 'setMetric'; value: ClickHouseVecQueryState['metric'] }
  | { type: 'setLimit'; value: number }
  | { type: 'startRun' }
  | { type: 'finishRun'; result: PostgresVectorSearchResult }
  | { type: 'failRun'; error: string }
  | { type: 'setError'; value: string | null };

function reducer(state: ClickHouseVecQueryState, action: ClickHouseVecQueryAction): ClickHouseVecQueryState {
  switch (action.type) {
    case 'setTable':
      return { ...state, table: action.value, column: '', result: null, error: null };
    case 'setColumn':
      return { ...state, column: action.value, result: null, error: null };
    case 'setVectorText':
      return { ...state, vectorText: action.value, sampledVector: null };
    case 'setSampledVector':
      return { ...state, vectorText: action.display, sampledVector: action.vector };
    case 'setMetric':
      return { ...state, metric: action.value };
    case 'setLimit':
      return { ...state, limit: clampLimit(action.value) };
    case 'startRun':
      return { ...state, running: true, error: null };
    case 'finishRun':
      return { ...state, running: false, result: action.result };
    case 'failRun':
      return { ...state, running: false, error: action.error };
    case 'setError':
      return { ...state, error: action.value };
    default:
      return state;
  }
}

interface ClickHouseVecQueryProps {
  readonly tab: Extract<WorkspaceTab, { type: 'clickhouse-vec-search' }>;
  readonly connectionId: string;
}

export function ClickHouseVecQuery({ tab, connectionId }: ClickHouseVecQueryProps) {
  const { data: capabilities } = useClickHouseVectorCapabilities(connectionId);
  const search = useClickHouseVectorSearch(connectionId);
  const sample = useClickhouseVecSample(connectionId);

  const [state, dispatch] = useReducer(reducer, {
    table: tab.table ?? '',
    column: tab.column ?? '',
    vectorText: tab.vectorText ?? '',
    sampledVector: null,
    metric: 'cosine',
    limit: 10,
    running: false,
    error: null,
    result: null,
  });

  const vectorTables = useMemo(() => {
    if (!capabilities?.columns) return [];
    return [...new Set(capabilities.columns.map((c) => c.tableName))].sort();
  }, [capabilities]);

  const vectorColumns = useMemo(() => {
    if (!capabilities?.columns || !state.table) return [];
    return capabilities.columns
      .filter((c) => c.tableName === state.table)
      .sort((a, b) => a.columnName.localeCompare(b.columnName));
  }, [capabilities, state.table]);

  // Auto-select first table
  useEffect(() => {
    if (!state.table && vectorTables.length > 0) {
      dispatch({ type: 'setTable', value: vectorTables[0] });
    }
  }, [state.table, vectorTables]);

  // Auto-select first column
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
    let vector: number[];
    if (state.sampledVector) {
      vector = state.sampledVector;
    } else {
      try {
        vector = parseVectorText(state.vectorText);
      } catch (error) {
        dispatch({ type: 'setError', value: error instanceof Error ? error.message : 'Invalid query vector' });
        return;
      }
    }
    dispatch({ type: 'startRun' });
    try {
      const raw: ClickHouseVectorSearchResult = await search.mutateAsync({
        table: state.table,
        column: state.column,
        vector,
        metric: state.metric,
        limit: state.limit,
      });
      // Coerce to PostgresVectorSearchResult shape for the shared results table
      const result: PostgresVectorSearchResult = {
        hits: raw.hits,
        durationMs: raw.durationMs,
      };
      dispatch({ type: 'finishRun', result });
    } catch (error) {
      const message = safeErrorMessage(error);
      dispatch({ type: 'failRun', error: message });
      void appendFrontendLog({
        level: 'error',
        scope: 'clickhouse-vec-query.run',
        message: `ClickHouse vector search failed: ${message}`,
        details: error instanceof Error ? error.stack : String(error),
      });
    }
  };

  const noColumns = capabilities && capabilities.columns.length === 0;

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Table selector */}
          <Select value={state.table} onValueChange={(v) => dispatch({ type: 'setTable', value: v ?? '' })}>
            <SelectTrigger className="w-40 h-8 text-xs">
              <SelectValue placeholder="Table" />
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
            value={state.column}
            onValueChange={(v) => dispatch({ type: 'setColumn', value: v ?? '' })}
            disabled={!state.table}
          >
            <SelectTrigger className="w-40 h-8 text-xs">
              <SelectValue placeholder="Column" />
            </SelectTrigger>
            <SelectContent>
              {vectorColumns.map((c) => (
                <SelectItem key={c.columnName} value={c.columnName}>
                  {c.columnName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Limit */}
          <Input
            type="number"
            min={1}
            max={1000}
            value={state.limit}
            onChange={(e) => dispatch({ type: 'setLimit', value: clampLimit(parseInt(e.target.value, 10) || 10) })}
            className="w-20 h-8 text-xs"
          />

          <Button
            variant="outline"
            size="sm"
            className="h-8 ml-auto"
            onClick={async () => {
              if (!state.table || !state.column) return;
              dispatch({ type: 'setError', value: null });
              try {
                const result = await sample.mutateAsync({ table: state.table, column: state.column });
                const preview = result.vector.slice(0, 8);
                const display =
                  preview.length < result.vector.length
                    ? `[${preview.join(', ')}, ...] // ${result.dimensions}d`
                    : `[${preview.join(', ')}]`;
                dispatch({ type: 'setSampledVector', vector: result.vector, display });
              } catch (err) {
                dispatch({ type: 'setError', value: safeErrorMessage(err, 'Failed to sample vector') });
              }
            }}
            disabled={sample.isPending || !state.table || !state.column}
          >
            {sample.isPending ? (
              <Loader2 className="size-3.5 mr-1.5 animate-spin" />
            ) : (
              <Dice5 className="size-3.5 mr-1.5" />
            )}
            Sample
          </Button>

          <Button size="sm" className="h-8" onClick={() => void run()} disabled={state.running}>
            {state.running ? (
              <Loader2 className="size-3.5 animate-spin mr-1.5" />
            ) : (
              <Play className="size-3.5 mr-1.5" />
            )}
            Search
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => {
              if (!state.table || !state.column) return;
              openClickhouseVecMapTab(connectionId, { table: state.table, column: state.column });
            }}
            disabled={!state.table || !state.column}
          >
            <Network className="size-3.5 mr-1.5" />
            Map
          </Button>
        </div>

        {/* Query vector */}
        <Textarea
          className="font-mono text-xs h-14 resize-none"
          placeholder="Enter query vector, e.g. [0.1, -0.4, 0.8, ...]"
          value={state.vectorText}
          onChange={(e) => dispatch({ type: 'setVectorText', value: e.target.value })}
        />
      </div>

      {state.error ? <div className="p-3 text-xs text-destructive">{state.error}</div> : null}

      {!capabilities ? (
        <div className="p-6 text-center text-sm text-muted-foreground">Loading vector capabilities…</div>
      ) : noColumns ? (
        <div className="p-6 text-center text-sm text-muted-foreground">
          No <code>Array(Float32)</code> columns found in this ClickHouse database. Create a column with type{' '}
          <code>Array(Float32)</code> to use vector search.
        </div>
      ) : state.result ? (
        <PostgresVectorResults result={state.result} />
      ) : (
        <div className="p-6 text-center text-sm text-muted-foreground">Enter a query vector and run a search</div>
      )}
    </div>
  );
}
