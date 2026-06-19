import { useMemo, useReducer } from 'react';
import { useQdrantPoints, useQdrantStats } from '@/hooks/use-qdrant';
import { api } from '@/lib/api';
import { openQdrantGraphTab, openQdrantSearchTab } from '@/store';
import { Button } from '@/components/ui/button';
import { QdrantFilterBuilder } from '@/components/qdrant-filter-builder';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DataTable, type ColumnDef } from '@/components/data-table';
import { ChevronLeft, ChevronRight, Network, Search, Sparkles } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';

interface QdrantViewProps {
  connectionId: string;
  collection: string;
}

// Group the related paging/filter state into one reducer so a single dispatch
// produces a single re-render instead of seven.
type QdrantViewState = {
  showStats: boolean;
  // Stack of page offsets we've visited so "Prev" can walk back. Index 0 is the first page (offset null).
  offsetStack: (string | number | null)[];
  draftFilter: Record<string, unknown> | undefined;
  appliedFilter: Record<string, unknown> | undefined;
  pageSize: number;
  pageInput: string;
  jumping: boolean;
  // Bump to remount the filter builder and drop its internal rows/json state.
  filterBuilderKey: number;
};

type QdrantViewAction =
  | { type: 'toggleStats' }
  | { type: 'resetPaging' }
  | { type: 'setDraftFilter'; value: Record<string, unknown> | undefined }
  | { type: 'applyFilter' }
  | { type: 'clearFilter' }
  | { type: 'setPageSize'; value: number }
  | { type: 'setPageInput'; value: string }
  | { type: 'setJumping'; value: boolean }
  | { type: 'pushOffset'; value: string | number | null }
  | { type: 'popOffset' }
  | { type: 'setOffsetStack'; value: (string | number | null)[] };

// Qdrant scroll uses opaque cursor offsets, so a "jump" walks forward one page
// at a time. Cap the number of walks per Go-click to keep the sidecar safe.
const MAX_JUMP_PAGES = 50;

function qdrantViewReducer(state: QdrantViewState, action: QdrantViewAction): QdrantViewState {
  switch (action.type) {
    case 'toggleStats':
      return { ...state, showStats: !state.showStats };
    case 'resetPaging':
      return { ...state, offsetStack: [null] };
    case 'setDraftFilter':
      return { ...state, draftFilter: action.value };
    case 'applyFilter':
      return { ...state, appliedFilter: state.draftFilter, offsetStack: [null] };
    case 'clearFilter':
      return {
        ...state,
        appliedFilter: undefined,
        draftFilter: undefined,
        filterBuilderKey: state.filterBuilderKey + 1,
        offsetStack: [null],
      };
    case 'setPageSize':
      return { ...state, pageSize: action.value, offsetStack: [null] };
    case 'setPageInput':
      return { ...state, pageInput: action.value };
    case 'setJumping':
      return { ...state, jumping: action.value };
    case 'pushOffset':
      return { ...state, offsetStack: [...state.offsetStack, action.value] };
    case 'popOffset':
      return state.offsetStack.length > 1 ? { ...state, offsetStack: state.offsetStack.slice(0, -1) } : state;
    case 'setOffsetStack':
      return { ...state, offsetStack: action.value };
  }
}

export function QdrantView({ connectionId, collection }: QdrantViewProps) {
  const [state, dispatch] = useReducer(qdrantViewReducer, {
    showStats: false,
    offsetStack: [null],
    draftFilter: undefined,
    appliedFilter: undefined,
    pageSize: 10,
    pageInput: '',
    jumping: false,
    filterBuilderKey: 0,
  });

  const currentOffset = state.offsetStack[state.offsetStack.length - 1];
  const { data: stats } = useQdrantStats(connectionId, collection);
  const {
    data: page,
    isLoading,
    error,
  } = useQdrantPoints(connectionId, collection, currentOffset, state.appliedFilter, state.pageSize);

  // Field names discovered from the current page, offered as filter suggestions.
  const fields = useMemo(() => {
    const keys = new Set<string>();
    for (const p of page?.points ?? []) for (const k of Object.keys(p.payload ?? {})) keys.add(k);
    return [...keys];
  }, [page]);

  type QdrantPoint = {
    id: string | number;
    payload?: Record<string, unknown>;
  };

  const columns: ColumnDef<QdrantPoint>[] = useMemo(
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

  const changePageSize = (n: number) => {
    dispatch({ type: 'setPageSize', value: Math.max(1, Math.min(500, n)) });
  };

  const goNext = () => {
    if (page?.nextOffset != null) dispatch({ type: 'pushOffset', value: page.nextOffset });
  };
  const goPrev = () => {
    dispatch({ type: 'popOffset' });
  };

  // Jump to an arbitrary page. Cached pages jump instantly; further pages are
  // reached by walking the scroll cursor forward (Qdrant has no random page access).
  const jumpToPage = async () => {
    const requested = parseInt(state.pageInput, 10);
    if (!Number.isInteger(requested) || requested < 1) return;
    if (requested <= state.offsetStack.length) {
      dispatch({ type: 'setOffsetStack', value: state.offsetStack.slice(0, requested) });
      return;
    }
    const target = Math.min(requested, state.offsetStack.length + MAX_JUMP_PAGES);
    dispatch({ type: 'setJumping', value: true });
    try {
      const stack = [...state.offsetStack];
      let offset = stack[stack.length - 1];
      while (stack.length < target) {
        const res = await api.scrollQdrantPoints(connectionId, {
          collection,
          limit: state.pageSize,
          offset: offset ?? null,
          filter: state.appliedFilter,
          withPayload: true,
        });
        if (res.nextOffset == null) break;
        offset = res.nextOffset;
        stack.push(offset);
      }
      dispatch({ type: 'setOffsetStack', value: stack });
    } finally {
      dispatch({ type: 'setJumping', value: false });
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border gap-2">
        <div className="flex items-center min-w-0 gap-2">
          <span className="text-sm font-mono truncate" title={collection}>
            {collection}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => dispatch({ type: 'toggleStats' })}
            className="px-1.5 py-0.5 text-xs"
          >
            {state.showStats ? 'Hide stats' : 'Stats'}
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => openQdrantGraphTab(connectionId, collection)}>
            <Network className="mr-1.5 size-3.5" />
            Visualize
          </Button>
          <Button variant="ghost" size="sm" onClick={() => openQdrantSearchTab(connectionId, collection)}>
            <Search className="mr-1.5 size-3.5" />
            Vector Search
          </Button>
        </div>
      </div>

      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${state.showStats && stats ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
      >
        <div className="overflow-hidden">
          {stats && (
            <div className="px-3 py-2 text-xs border-b border-border">
              <div className="flex flex-wrap gap-x-6 gap-y-1">
                {[
                  ['Points', stats.pointsCount],
                  ['Vectors', stats.vectorsCount],
                  ['Indexed', stats.indexedVectorsCount],
                  ['Segments', stats.segmentsCount],
                  ['Dimensions', stats.vectorSize],
                  ['Distance', stats.distance],
                  ['Status', stats.status],
                ].map(([label, value]) => (
                  <div key={String(label)} className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">{label}:</span>
                    <span className="text-foreground/80 font-mono">{value ?? '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="px-3 py-2 border-b border-border space-y-2">
        <QdrantFilterBuilder
          key={state.filterBuilderKey}
          onChange={(v) => dispatch({ type: 'setDraftFilter', value: v })}
          fields={fields}
        />
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => dispatch({ type: 'applyFilter' })}>
            Apply filter
          </Button>
          {state.appliedFilter && (
            <Button variant="ghost" size="sm" onClick={() => dispatch({ type: 'clearFilter' })}>
              Clear
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner size="lg" />
          </div>
        ) : error ? (
          <div className="p-4 text-sm text-destructive">
            {error instanceof Error ? error.message : 'Failed to load points'}
          </div>
        ) : (
          <DataTable
            rows={page?.points ?? []}
            columns={columns}
            rowKey={(p) => String(p.id)}
            prefixHeader="Actions"
            prefixWidth="40px"
            prefixCellClassName="bg-background"
            fixedTemplate="40px 192px minmax(0, 1fr)"
            stickyHeader
            rowClassName="group"
            prefix={(p) => (
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  openQdrantSearchTab(connectionId, collection, { mode: 'similar', pointId: String(p.id) });
                }}
                className="opacity-0 group-hover:opacity-100"
                title="Find similar points"
              >
                <Sparkles className="size-3.5" />
              </Button>
            )}
            emptyMessage="No points"
            className="overflow-visible"
          />
        )}
      </div>

      <div className="flex items-center justify-between px-3 py-1.5 text-xs text-muted-foreground border-t border-border gap-3">
        <div className="flex items-center gap-3">
          <Input
            type="number"
            min={1}
            max={500}
            value={state.pageSize}
            onChange={(e) => changePageSize(Number(e.target.value) || 1)}
            className="px-1.5 h-6 w-16 bg-background rounded-sm border focus:outline-hidden focus:ring-1 focus:ring-primary/50"
          />
        </div>
        <div className="flex items-center gap-2">
          <Label className="flex items-center gap-1">
            Page
            <Input
              type="number"
              min={1}
              value={state.pageInput}
              placeholder={String(state.offsetStack.length)}
              onChange={(e) => dispatch({ type: 'setPageInput', value: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && jumpToPage()}
              className="px-1.5 h-6 w-16 bg-background rounded-sm border focus:outline-hidden focus:ring-1 focus:ring-primary/50"
            />
          </Label>
          <Button variant="outline" size="sm" onClick={jumpToPage} disabled={state.jumping}>
            {state.jumping ? <Spinner size="sm" /> : 'Go'}
          </Button>
          <span className="tabular-nums">page {state.offsetStack.length}</span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" onClick={goPrev} disabled={state.offsetStack.length <= 1}>
              <ChevronLeft className="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={goNext} disabled={page?.nextOffset == null}>
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
