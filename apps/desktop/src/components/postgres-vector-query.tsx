import { useEffect, useMemo, useReducer } from 'react';
import type { WorkspaceTab } from '@kamehadb/shared';
import { usePostgresVectorCapabilities, usePostgresVectorSearch } from '@/hooks/use-postgres-vector';
import { parseVectorText } from '@/lib/postgres-vector';
import { PostgresVectorResults } from '@/components/postgres-vector-results';
import { pgVectorReducer } from '@/components/postgres-vector-query-state';
import { PostgresVectorQueryControls } from '@/components/postgres-vector-query-controls';
import { openPostgresVectorMapTab } from '@/store';

interface PostgresVectorQueryProps {
  readonly tab: Extract<WorkspaceTab, { type: 'postgres-vector-search' }>;
  readonly connectionId: string;
}

export function PostgresVectorQuery({ tab, connectionId }: PostgresVectorQueryProps) {
  const { data: capabilities } = usePostgresVectorCapabilities(connectionId);
  const vectorSearch = usePostgresVectorSearch(connectionId);

  const [state, dispatch] = useReducer(pgVectorReducer, {
    schema: tab.schema ?? '',
    table: tab.table ?? '',
    column: tab.column ?? '',
    vectorText: tab.vectorText ?? '',
    filterText: '',
    metric: 'cosine',
    limit: 10,
    running: false,
    error: null,
    info: null,
    result: null,
  });

  const schemas = useMemo(() => {
    if (!capabilities?.columns) return [];
    return [...new Set(capabilities.columns.map((column) => column.tableSchema))].sort();
  }, [capabilities]);

  const vectorTables = useMemo(() => {
    if (!capabilities?.columns || !state.schema) return [];
    return capabilities.columns
      .filter((column) => column.tableSchema === state.schema)
      .map((column) => column.tableName)
      .filter((value, index, array) => array.indexOf(value) === index)
      .sort();
  }, [capabilities, state.schema]);

  const vectorColumns = useMemo(() => {
    if (!capabilities?.columns || !state.table) return [];
    return capabilities.columns
      .filter((column) => column.tableSchema === state.schema && column.tableName === state.table)
      .sort((a, b) => a.columnName.localeCompare(b.columnName));
  }, [capabilities, state.schema, state.table]);

  useEffect(() => {
    if (!state.schema && schemas.length > 0) {
      dispatch({ type: 'setSchema', value: schemas[0] });
    }
  }, [schemas, state.schema]);

  useEffect(() => {
    if (!state.table && vectorTables.length > 0) {
      dispatch({ type: 'setTable', value: vectorTables[0] });
    }
  }, [state.table, vectorTables]);

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
      try {
        vector = parseVectorText(state.vectorText);
      } catch (error) {
        dispatch({ type: 'setError', value: error instanceof Error ? error.message : 'Invalid query vector' });
        dispatch({ type: 'endRun' });
        return;
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

      const result = await vectorSearch.mutateAsync({
        schema: state.schema || undefined,
        table: state.table,
        column: state.column,
        vector,
        filter: state.filterText.trim() || undefined,
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
      ? 'pgvector extension is not installed on this server.'
      : capabilities && capabilities.columns.length === 0
        ? 'No vector columns found in this database.'
        : 'Enter a query vector and run a search';

  return (
    <div className="flex flex-col h-full">
      <PostgresVectorQueryControls
        schema={state.schema}
        table={state.table}
        column={state.column}
        metric={state.metric}
        limit={state.limit}
        vectorText={state.vectorText}
        filterText={state.filterText}
        running={state.running}
        error={state.error}
        info={state.info}
        schemas={schemas}
        vectorTables={vectorTables}
        vectorColumns={vectorColumns}
        onSchemaChange={(value) => dispatch({ type: 'setSchema', value })}
        onTableChange={(value) => dispatch({ type: 'setTable', value })}
        onColumnChange={(value) => dispatch({ type: 'setColumn', value })}
        onMetricChange={(value) => dispatch({ type: 'setMetric', value })}
        onLimitChange={(value) => dispatch({ type: 'setLimit', value })}
        onVectorTextChange={(value) => dispatch({ type: 'setVectorText', value })}
        onFilterTextChange={(value) => dispatch({ type: 'setFilterText', value })}
        onRun={run}
      />

      <div className="flex-1 overflow-auto min-h-0">
        {state.result ? (
          <PostgresVectorResults
            result={state.result}
            onViewMap={() => {
              if (!state.schema || !state.table || !state.column) return;
              openPostgresVectorMapTab(connectionId, {
                schema: state.schema,
                table: state.table,
                column: state.column,
              });
            }}
          />
        ) : (
          <div className="p-3 text-sm text-muted-foreground">{emptyMessage}</div>
        )}
      </div>
    </div>
  );
}
