import { useMemo, useState } from 'react';
import { useQdrantPoints, useQdrantStats } from '@/hooks/use-qdrant';
import { api } from '@/lib/api';
import { openQdrantGraphTab, openQdrantSearchTab } from '@/store';
import { Button } from '@/components/ui/button';
import { QdrantFilterBuilder } from '@/components/qdrant-filter-builder';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DataTable, type ColumnDef } from '@/components/data-table';
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
    const target = parseInt(pageInput, 10);
    if (!Number.isInteger(target) || target < 1) return;
    if (target <= offsetStack.length) {
      setOffsetStack((s) => s.slice(0, target));
      return;
    }
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
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowStats(!showStats)}
            className="text-[11px] px-1.5 py-0.5"
          >
            {showStats ? 'Hide stats' : 'Stats'}
          </Button>
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
        <QdrantFilterBuilder onChange={setDraftFilter} fields={fields} />
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
        ) : (
          <DataTable
            rows={page?.points ?? []}
            columns={columns}
            rowKey={(p) => String(p.id)}
            fixedTemplate="192px minmax(0, 1fr) 40px"
            stickyHeader
            rowClassName="group"
            suffix={(p) => (
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
            suffixWidth="40px"
            emptyMessage="No points"
            className="overflow-visible"
          />
        )}
      </div>

      <div className="px-3 py-1.5 border-t border-border flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          <Input
            type="number"
            min={1}
            max={500}
            value={pageSize}
            onChange={(e) => changePageSize(Number(e.target.value) || 1)}
            className="h-6 w-16 px-1.5 bg-background border rounded focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>
        <div className="flex items-center gap-2">
          <Label className="flex items-center gap-1">
            Page
            <Input
              type="number"
              min={1}
              value={pageInput}
              placeholder={String(offsetStack.length)}
              onChange={(e) => setPageInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && jumpToPage()}
              className="h-6 w-16 px-1.5 bg-background border rounded focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </Label>
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
