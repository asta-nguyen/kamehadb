import { useEffect, useMemo, useReducer } from 'react';
import type { WorkspaceTab } from '@/lib/types';
import type { QdrantSearchResult } from '@kamehadb/shared';
import { useQdrantCollections, useQdrantSearch } from '@/hooks/use-qdrant';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DataTable, type ColumnDef } from '@/components/data-table';
import { Play } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';

interface QdrantQueryProps {
  tab: Extract<WorkspaceTab, { type: 'qdrant-search' }>;
  connectionId: string;
}

// Group collection / vectorText / limit /
// running / error / result into one reducer so a single dispatch
// produces a single re-render instead of ten.
type QdrantQueryState = {
  collection: string;
  vectorText: string;
  limit: number;
  running: boolean;
  error: string | null;
  result: QdrantSearchResult | null;
};

type QdrantQueryAction =
  | { type: 'setCollection'; value: string }
  | { type: 'setVectorText'; value: string }
  | { type: 'setLimit'; value: number }
  | { type: 'startRun' }
  | { type: 'finishRun'; result: QdrantSearchResult }
  | { type: 'failRun'; error: string }
  | { type: 'endRun' }
  | { type: 'resetResult' }
  | { type: 'setError'; value: string | null };

function qdrantQueryReducer(state: QdrantQueryState, action: QdrantQueryAction): QdrantQueryState {
  switch (action.type) {
    case 'setCollection':
      return { ...state, collection: action.value, result: null, error: null };
    case 'setVectorText':
      return { ...state, vectorText: action.value };
    case 'setLimit':
      return { ...state, limit: action.value };
    case 'startRun':
      return { ...state, running: true, error: null };
    case 'finishRun':
      return { ...state, running: false, result: action.result };
    case 'failRun':
      return { ...state, running: false, error: action.error };
    case 'endRun':
      return { ...state, running: false };
    case 'resetResult':
      return { ...state, result: null, error: null };
    case 'setError':
      return { ...state, error: action.value };
  }
}

export function QdrantQuery({ tab, connectionId }: QdrantQueryProps) {
  const { data: collections } = useQdrantCollections(connectionId);
  const [state, dispatch] = useReducer(qdrantQueryReducer, {
    collection: tab.collection ?? '',
    vectorText: '',
    limit: 10,
    running: false,
    error: null,
    result: null,
  });

  const search = useQdrantSearch(connectionId);

  type QdrantHit = {
    id: string | number;
    score: number;
    payload?: Record<string, unknown>;
  };

  const columns: ColumnDef<QdrantHit>[] = useMemo(
    () => [
      {
        id: 'id',
        header: 'ID',
        accessor: (row) => row.id,
        headerClassName: 'px-3 py-1.5 font-medium h-auto',
        cellClassName: 'px-3 py-1.5 font-mono text-muted-foreground break-all',
        render: (value) => <span>{String(value)}</span>,
      },
      {
        id: 'score',
        header: 'Score',
        accessor: (row) => row.score,
        headerClassName: 'px-3 py-1.5 font-medium h-auto',
        cellClassName: 'px-3 py-1.5 font-mono',
        render: (value) => <span>{(value as number).toFixed(4)}</span>,
      },
      {
        id: 'payload',
        header: 'Payload',
        accessor: (row) => row.payload,
        headerClassName: 'px-3 py-1.5 font-medium h-auto',
        cellClassName: 'px-3 py-1.5',
        render: (value) => (
          <pre className="font-mono whitespace-pre-wrap break-all">{value ? JSON.stringify(value, null, 2) : '—'}</pre>
        ),
      },
    ],
    [],
  );

  // Default to the first collection once they load, if none preselected.
  useEffect(() => {
    if (!state.collection && collections?.length) {
      dispatch({ type: 'setCollection', value: collections[0].name });
    }
  }, [collections, state.collection]);

  const run = async () => {
    dispatch({ type: 'setError', value: null });
    if (!state.collection) {
      dispatch({ type: 'setError', value: 'Select a collection' });
      return;
    }

    dispatch({ type: 'startRun' });
    try {
      let vector: number[];
      try {
        const parsed = JSON.parse(state.vectorText);
        if (!Array.isArray(parsed) || !parsed.every((n) => typeof n === 'number')) {
          throw new Error('Vector must be a JSON array of numbers, e.g. [0.1, 0.2, 0.3]');
        }
        vector = parsed;
      } catch (e) {
        dispatch({ type: 'setError', value: e instanceof Error ? e.message : 'Invalid query vector' });
        dispatch({ type: 'endRun' });
        return;
      }
      const res = await search.mutateAsync({
        collection: state.collection,
        vector,
        limit: state.limit,
        withPayload: true,
      });
      dispatch({ type: 'finishRun', result: res });
    } catch (e) {
      dispatch({ type: 'failRun', error: e instanceof Error ? e.message : 'Search failed' });
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border space-y-2">
        <div className="flex items-center gap-2">
          <Select
            value={state.collection || '_select'}
            onValueChange={(v) => dispatch({ type: 'setCollection', value: v === '_select' || v == null ? '' : v })}
          >
            <SelectTrigger size="sm" className="h-7 text-xs">
              <SelectValue placeholder="Select collection…" />
            </SelectTrigger>
            <SelectContent>
              {collections?.map((c) => (
                <SelectItem key={c.name} value={c.name}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Label className="text-xs text-muted-foreground flex items-center gap-1">
            Limit
            <Input
              type="number"
              min={1}
              max={500}
              value={state.limit}
              onChange={(e) =>
                dispatch({ type: 'setLimit', value: Math.max(1, Math.min(500, Number(e.target.value) || 1)) })
              }
              className="h-7 w-16 px-2 text-xs bg-background border rounded focus:outline-none focus:ring-1 focus:ring-primary/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </Label>
          <Button size="sm" onClick={run} disabled={state.running} className="ml-auto">
            {state.running ? <Spinner size="sm" className="size-3.5 mr-1.5" /> : <Play className="size-3.5 mr-1.5" />}
            Search
          </Button>
        </div>

        <Textarea
          value={state.vectorText}
          onChange={(e) => dispatch({ type: 'setVectorText', value: e.target.value })}
          placeholder="[0.1, 0.2, 0.3, ...]"
          spellCheck={false}
          className="w-full min-h-20 px-2 py-1 text-xs font-mono bg-background border rounded resize-y focus:outline-none focus:ring-1 focus:ring-primary/50"
        />

        {state.error && <div className="text-xs text-destructive">{state.error}</div>}
      </div>

      <div className="flex-1 overflow-auto min-h-0">
        {state.result ? (
          <DataTable
            rows={state.result.hits}
            columns={columns}
            rowKey={(h) => String(h.id)}
            fixedTemplate="160px 96px minmax(0, 1fr)"
            stickyHeader
            emptyMessage="No results"
            className="overflow-visible"
          />
        ) : (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            Enter a query vector and run a search
          </div>
        )}
      </div>

      {state.result && (
        <div className="px-3 py-1.5 border-t border-border text-xs text-muted-foreground">
          {state.result.hits.length} results in {state.result.durationMs}ms
        </div>
      )}
    </div>
  );
}
