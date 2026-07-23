import { useEffect, useMemo, useReducer } from 'react';
import type { WorkspaceTab } from '@/lib/types';
import type { QdrantSearchResult } from '@kamehadb/shared';
import { useQdrantCollections, useQdrantPoints, useQdrantRecommend, useQdrantSearch } from '@/hooks/use-qdrant';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DataTable, type ColumnDef } from '@/components/data-table';
import { QdrantFilterBuilder } from '@/components/qdrant-filter-builder';
import { localEmbedding } from '@kamehadb/shared';
import { Play } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { appendFrontendLog } from '@/lib/app-logs';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';

interface QdrantQueryProps {
  tab: Extract<WorkspaceTab, { type: 'qdrant-search' }>;
  connectionId: number;
}

type Mode = 'text' | 'similar' | 'raw';

const MODES: { value: Mode; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'similar', label: 'Find similar' },
  { value: 'raw', label: 'Advanced' },
];

// Group collection / mode / text / pointId / vectorText / filter / limit /
// running / error / info / result into one reducer so a single dispatch
// produces a single re-render instead of ten.
type QdrantQueryState = {
  collection: string;
  mode: Mode;
  text: string;
  pointId: string;
  vectorText: string;
  filter: Record<string, unknown> | undefined;
  limit: number;
  running: boolean;
  error: string | null;
  info: string | null;
  result: QdrantSearchResult | null;
};

type QdrantQueryAction =
  | { type: 'setCollection'; value: string }
  | { type: 'setMode'; value: Mode }
  | { type: 'setText'; value: string }
  | { type: 'setPointId'; value: string }
  | { type: 'setVectorText'; value: string }
  | { type: 'setFilter'; value: Record<string, unknown> | undefined }
  | { type: 'setLimit'; value: number }
  | { type: 'startRun' }
  | { type: 'finishRun'; result: QdrantSearchResult; info?: string }
  | { type: 'failRun'; error: string }
  | { type: 'endRun' }
  | { type: 'resetResult' }
  | { type: 'setError'; value: string | null };

function qdrantQueryReducer(state: QdrantQueryState, action: QdrantQueryAction): QdrantQueryState {
  switch (action.type) {
    case 'setCollection':
      return { ...state, collection: action.value, result: null, info: null, error: null };
    case 'setMode':
      return { ...state, mode: action.value, result: null, info: null, error: null };
    case 'setText':
      return { ...state, text: action.value };
    case 'setPointId':
      return { ...state, pointId: action.value };
    case 'setVectorText':
      return { ...state, vectorText: action.value };
    case 'setFilter':
      return { ...state, filter: action.value };
    case 'setLimit':
      return { ...state, limit: action.value };
    case 'startRun':
      return { ...state, running: true, error: null, info: null };
    case 'finishRun':
      return { ...state, running: false, result: action.result, info: action.info ?? state.info };
    case 'failRun':
      return { ...state, running: false, error: action.error };
    case 'endRun':
      return { ...state, running: false };
    case 'resetResult':
      return { ...state, result: null, info: null, error: null };
    case 'setError':
      return { ...state, error: action.value };
  }
}

export function QdrantQuery({ tab, connectionId }: QdrantQueryProps) {
  const { data: collections } = useQdrantCollections(connectionId);
  const [state, dispatch] = useReducer(qdrantQueryReducer, {
    collection: tab.collection ?? '',
    mode: tab.mode ?? (tab.pointId ? 'similar' : 'text'),
    text: '',
    pointId: tab.pointId?.toString() ?? '',
    vectorText: '',
    filter: undefined,
    limit: 10,
    running: false,
    error: null,
    info: null,
    result: null,
  });

  const search = useQdrantSearch(connectionId);
  const recommend = useQdrantRecommend(connectionId);

  // Sample the chosen collection to get vector size and payload fields.
  const { data: sample } = useQdrantPoints(connectionId, state.collection);
  const fields = useMemo(() => {
    const keys = new Set<string>();
    for (const p of sample?.points ?? []) for (const k of Object.keys(p.payload ?? {})) keys.add(k);
    return [...keys];
  }, [sample]);

  const vectorSize = useMemo(() => {
    const first = sample?.points?.[0]?.vector;
    if (Array.isArray(first) && typeof first[0] === 'number') return first.length;
    if (first && typeof first === 'object') {
      const v = Object.values(first as Record<string, unknown>)[0];
      if (Array.isArray(v)) return v.length;
    }
    return 128;
  }, [sample]);

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
      if (state.mode === 'text') {
        if (!state.text.trim()) {
          dispatch({ type: 'setError', value: 'Enter some text to search for' });
          dispatch({ type: 'endRun' });
          return;
        }
        const vector = localEmbedding(state.text, vectorSize);
        const res = await search.mutateAsync({
          collection: state.collection,
          vector,
          limit: state.limit,
          filter: state.filter,
          withPayload: true,
        });
        dispatch({
          type: 'finishRun',
          result: res,
          info: `Embedded to ${vectorSize} dimensions (local hash-based). Note: the hash tokenizer was updated to support Unicode text; collections previously indexed with the older ASCII-only localEmbedding may need reindexing for non-ASCII queries.`,
        });
      } else if (state.mode === 'similar') {
        if (!state.pointId.trim()) {
          dispatch({ type: 'setError', value: 'Enter a point ID' });
          dispatch({ type: 'endRun' });
          return;
        }
        const id = /^\d+$/.test(state.pointId.trim()) ? Number(state.pointId.trim()) : state.pointId.trim();
        const res = await recommend.mutateAsync({
          collection: state.collection,
          pointId: id,
          limit: state.limit,
          filter: state.filter,
          withPayload: true,
        });
        dispatch({ type: 'finishRun', result: res });
      } else {
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
          filter: state.filter,
          withPayload: true,
        });
        dispatch({ type: 'finishRun', result: res });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Search failed';
      dispatch({ type: 'failRun', error: message });
      void appendFrontendLog({
        level: 'error',
        scope: 'qdrant-query.run',
        message: `Qdrant search failed: ${message}`,
        details: e instanceof Error ? e.stack : String(e),
      });
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border space-y-2">
        {/* Mode tabs */}
        <div className="flex items-center gap-1 bg-muted/40 rounded-md p-0.5 w-fit">
          {MODES.map((m) => (
            <Button
              key={m.value}
              variant="ghost"
              size="sm"
              onClick={() => dispatch({ type: 'setMode', value: m.value })}
              className={`${state.mode === m.value ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {m.label}
            </Button>
          ))}
        </div>

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

        {/* Mode-specific input */}
        {state.mode === 'text' && (
          <div className="space-y-2">
            <Input
              value={state.text}
              onChange={(e) => dispatch({ type: 'setText', value: e.target.value })}
              placeholder="Describe what you're looking for…"
              className="w-full h-7 px-2 text-xs bg-background border rounded focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
            <p className="text-xs text-muted-foreground">
              Text is converted to a vector locally using hash-based embedding — no AI provider needed. Works at
              {vectorSize} dimensions.
            </p>
          </div>
        )}

        {state.mode === 'similar' && (
          <div className="space-y-1">
            <Input
              value={state.pointId}
              onChange={(e) => dispatch({ type: 'setPointId', value: e.target.value })}
              placeholder="Point ID to find neighbors of"
              className="w-full h-7 px-2 text-xs font-mono bg-background border rounded focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
            <p className="text-xs text-muted-foreground">
              Finds points most similar to an existing point — no model needed.
            </p>
          </div>
        )}

        {state.mode === 'raw' && (
          <Textarea
            value={state.vectorText}
            onChange={(e) => dispatch({ type: 'setVectorText', value: e.target.value })}
            placeholder="[0.1, 0.2, 0.3, ...]"
            spellCheck={false}
            className="w-full min-h-20 px-2 py-1 text-xs font-mono bg-background border rounded resize-y focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        )}

        <QdrantFilterBuilder onChange={(v) => dispatch({ type: 'setFilter', value: v })} fields={fields} />

        {state.error && <ErrorState compact error={new Error(state.error)} />}
        {state.info && !state.error && <div className="text-xs text-muted-foreground">{state.info}</div>}
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
          <EmptyState
            title={
              state.mode === 'text'
                ? 'Type a query and run a search'
                : state.mode === 'similar'
                  ? 'Enter a point ID to find similar points'
                  : 'Enter a query vector and run a search'
            }
          />
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
