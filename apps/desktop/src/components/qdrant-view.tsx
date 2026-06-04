import { useMemo, useState } from 'react';
import { useQdrantPoints, useQdrantStats } from '@/hooks/use-qdrant';
import { api } from '@/lib/api';
import { openQdrantGraphTab, openQdrantSearchTab } from '@/store';
import { Button } from '@/components/ui/button';
import { QdrantFilterBuilder } from '@/components/qdrant-filter-builder';
import { ChevronLeft, ChevronRight, Loader2, Network, Search, Sparkles } from 'lucide-react';

interface QdrantViewProps {
  connectionId: string;
  collection: string;
}

export function QdrantView({ connectionId, collection }: QdrantViewProps) {
  const [showStats, setShowStats] = useState(false);
  // Stack of page offsets we've visited so "Prev" can walk back. Index 0 is the first page (offset null).
  const [offsetStack, setOffsetStack] = useState<(string | number | null)[]>([null]);
  const [draftFilter, setDraftFilter] = useState<Record<string, unknown> | undefined>(undefined);
  const [appliedFilter, setAppliedFilter] = useState<Record<string, unknown> | undefined>(undefined);
  const [pageSize, setPageSize] = useState(10);
  const [pageInput, setPageInput] = useState('');
  const [jumping, setJumping] = useState(false);
  // Bump to remount the filter builder and drop its internal rows/json state.
  const [filterBuilderKey, setFilterBuilderKey] = useState(0);

  // Qdrant scroll uses opaque cursor offsets, so a "jump" walks forward one page
  // at a time. Cap the number of walks per Go-click to keep the sidecar safe.
  const MAX_JUMP_PAGES = 50;

  const currentOffset = offsetStack[offsetStack.length - 1];
  const { data: stats } = useQdrantStats(connectionId, collection);
  const {
    data: page,
    isLoading,
    error,
  } = useQdrantPoints(connectionId, collection, currentOffset, appliedFilter, pageSize);

  // Field names discovered from the current page, offered as filter suggestions.
  const fields = useMemo(() => {
    const keys = new Set<string>();
    for (const p of page?.points ?? []) for (const k of Object.keys(p.payload ?? {})) keys.add(k);
    return [...keys];
  }, [page]);

  const resetPaging = () => setOffsetStack([null]);

  const applyFilter = () => {
    resetPaging();
    setAppliedFilter(draftFilter);
  };

  const changePageSize = (n: number) => {
    setPageSize(Math.max(1, Math.min(500, n)));
    resetPaging();
  };

  const goNext = () => {
    if (page?.nextOffset != null) setOffsetStack((s) => [...s, page.nextOffset]);
  };
  const goPrev = () => {
    if (offsetStack.length > 1) setOffsetStack((s) => s.slice(0, -1));
  };

  // Jump to an arbitrary page. Cached pages jump instantly; further pages are
  // reached by walking the scroll cursor forward (Qdrant has no random page access).
  const jumpToPage = async () => {
    const requested = parseInt(pageInput, 10);
    if (!Number.isInteger(requested) || requested < 1) return;
    if (requested <= offsetStack.length) {
      setOffsetStack((s) => s.slice(0, requested));
      return;
    }
    const target = Math.min(requested, offsetStack.length + MAX_JUMP_PAGES);
    setJumping(true);
    try {
      const stack = [...offsetStack];
      let offset = stack[stack.length - 1];
      while (stack.length < target) {
        const res = await api.scrollQdrantPoints(connectionId, {
          collection,
          limit: pageSize,
          offset: offset ?? null,
          filter: appliedFilter,
          withPayload: true,
        });
        if (res.nextOffset == null) break;
        offset = res.nextOffset;
        stack.push(offset);
      }
      setOffsetStack(stack);
    } finally {
      setJumping(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-border flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-sm truncate" title={collection}>
            {collection}
          </span>
          <button
            onClick={() => setShowStats(!showStats)}
            className="text-[11px] px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground/70 hover:text-foreground hover:bg-muted/70 transition-colors"
          >
            {showStats ? 'Hide stats' : 'Stats'}
          </button>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => openQdrantGraphTab(connectionId, collection)}>
            <Network className="size-3.5 mr-1.5" />
            Visualize
          </Button>
          <Button variant="ghost" size="sm" onClick={() => openQdrantSearchTab(connectionId, collection)}>
            <Search className="size-3.5 mr-1.5" />
            Vector Search
          </Button>
        </div>
      </div>

      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${showStats && stats ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
      >
        <div className="overflow-hidden">
          {stats && (
            <div className="px-3 py-2 border-b border-border text-xs">
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
                    <span className="font-mono text-foreground/80">{value ?? '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="px-3 py-2 border-b border-border space-y-2">
        <QdrantFilterBuilder key={filterBuilderKey} onChange={setDraftFilter} fields={fields} />
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={applyFilter}>
            Apply filter
          </Button>
          {appliedFilter && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setAppliedFilter(undefined);
                setDraftFilter(undefined);
                setFilterBuilderKey((k) => k + 1);
                resetPaging();
              }}
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="p-4 text-sm text-destructive">
            {error instanceof Error ? error.message : 'Failed to load points'}
          </div>
        ) : !page || page.points.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">No points</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/50 backdrop-blur">
              <tr className="text-left text-muted-foreground">
                <th className="px-3 py-1.5 font-medium w-48">ID</th>
                <th className="px-3 py-1.5 font-medium">Payload</th>
                <th className="px-3 py-1.5 font-medium w-10" />
              </tr>
            </thead>
            <tbody>
              {page.points.map((p) => (
                <tr key={String(p.id)} className="group border-b border-border/50 align-top">
                  <td className="px-3 py-1.5 font-mono text-muted-foreground break-all">{String(p.id)}</td>
                  <td className="px-3 py-1.5">
                    <pre className="font-mono whitespace-pre-wrap break-all">
                      {p.payload ? JSON.stringify(p.payload, null, 2) : '—'}
                    </pre>
                  </td>
                  <td className="px-3 py-1.5">
                    <button
                      onClick={() =>
                        openQdrantSearchTab(connectionId, collection, { mode: 'similar', pointId: String(p.id) })
                      }
                      className="p-1 rounded hover:bg-primary/10 text-muted-foreground/60 hover:text-primary transition-colors opacity-0 group-hover:opacity-100"
                      title="Find similar points"
                    >
                      <Sparkles className="size-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="px-3 py-1.5 border-t border-border flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          <input
            type="number"
            min={1}
            max={500}
            value={pageSize}
            onChange={(e) => changePageSize(Number(e.target.value) || 1)}
            className="h-6 w-16 px-1.5 bg-background border rounded focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1">
            Page
            <input
              type="number"
              min={1}
              value={pageInput}
              placeholder={String(offsetStack.length)}
              onChange={(e) => setPageInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && jumpToPage()}
              className="h-6 w-16 px-1.5 bg-background border rounded focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </label>
          <Button variant="outline" size="sm" onClick={jumpToPage} disabled={jumping}>
            {jumping ? <Loader2 className="size-3 animate-spin" /> : 'Go'}
          </Button>
          <span className="tabular-nums">page {offsetStack.length}</span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" onClick={goPrev} disabled={offsetStack.length <= 1}>
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
