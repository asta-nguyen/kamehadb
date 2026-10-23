import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface DataFooterProps {
  rowCount: number;
  durationMs: number;
  page: number;
  // Actual skip offset of this page — may differ from page*pageSize after a
  // byte-bounded page admitted fewer rows than requested.
  startRow?: number;
  // Disable the page-jump input once a byte-limited page was seen: offsets of
  // unvisited pages are then unknowable.
  disablePageJump?: boolean;
  totalCount?: number | string;
  countMode?: string;
  countPending?: boolean;
  countError?: string | null;
  onCount?: (mode: 'estimated' | 'exact') => void;
  pageSize: number;
  hasMore: boolean;
  isFetching?: boolean;
  onPageChange: (page: number) => void;
  onExportJSON: () => void;
  onExportCSV: () => void;
  onCopyJSON: () => void;
  className?: string;
}

export function DataFooter({
  rowCount,
  durationMs,
  page,
  startRow,
  disablePageJump,
  totalCount,
  countMode,
  countPending,
  countError,
  onCount,
  pageSize,
  hasMore,
  isFetching,
  onPageChange,
  onExportJSON,
  onExportCSV,
  onCopyJSON,
  className,
}: DataFooterProps) {
  // Page jumps need a known total; without one the footer offers Prev/Next only.
  // String totals only appear beyond JS safe-integer range — page math uses
  // Number() as a bound while the exact string is what gets displayed.
  // A pending or failed count is not a total — displayTotal suppresses the
  // placeholder 0 and keeps the Count menu reachable for retry.
  const displayTotal = countPending || countError != null ? undefined : totalCount;
  const maxPage = displayTotal != null ? Math.max(page, Math.ceil(Number(displayTotal) / pageSize) - 1) : page;
  // startRow defaults to the old page*pageSize offset for callers that never
  // see byte-shortened pages; range display uses the actual offset otherwise.
  const first = startRow ?? page * pageSize;
  return (
    <div
      className={`px-3 py-1.5 text-xs text-muted-foreground border-t bg-muted/30 flex items-center gap-3 rounded-b-md ${
        className ?? ''
      }`}
    >
      <span>
        {rowCount > 0 ? `${first + 1}–${first + rowCount}` : 0} rows
        {countPending && <Spinner size="sm" className="inline-block ml-1" />}
        {displayTotal != null && (
          <span className="ml-1">
            of {displayTotal}
            {countMode && <span className="text-muted-foreground/70"> ({countMode})</span>}
          </span>
        )}
      </span>
      {/* Counts are opt-in work: the page itself never runs a count. Estimated
          is offered always and the backend rejects it when a filter/search is
          active; exact counts the effective filter and is cancellable. (Why) */}
      {(displayTotal == null || countError != null) && onCount && (
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={countPending}
            className="inline-flex items-center justify-center rounded-lg border border-border text-xs font-medium h-6 px-2 hover:bg-muted hover:text-foreground"
          >
            {countPending ? <Spinner size="sm" /> : 'Count…'}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-auto min-w-32">
            <DropdownMenuItem onClick={() => onCount('estimated')}>Estimated (fast)</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onCount('exact')}>Exact (slower)</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {countError && <span className="text-destructive">{countError}</span>}
      <span className="ml-auto">{durationMs}ms</span>
      {isFetching && (
        <span className="flex items-center gap-1 text-muted-foreground">
          <Spinner size="sm" />
          Loading...
        </span>
      )}
      <div className="flex items-center gap-2">
        {displayTotal != null && !disablePageJump ? (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span>Page</span>
            <Input
              type="number"
              min={1}
              max={maxPage + 1}
              disabled={isFetching}
              value={page + 1}
              onChange={(e) => {
                const p = parseInt(e.target.value, 10);
                if (!isNaN(p) && p >= 1) onPageChange(Math.min(p - 1, maxPage));
              }}
              className="h-7 w-14 text-xs text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">Page {page + 1}</span>
        )}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={page === 0 || isFetching}
            onClick={() => onPageChange(Math.max(0, page - 1))}
          >
            <ChevronLeft className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={!hasMore || isFetching}
            onClick={() => onPageChange(page + 1)}
          >
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger className="inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-xs font-medium whitespace-nowrap transition-all outline-none select-none h-7 gap-1 hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50 px-2.5 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5">
          <Download className="size-3" />
        </DropdownMenuTrigger>
        {/* w-auto: default pins menu width to the icon trigger, wrapping labels */}
        <DropdownMenuContent align="end" className="w-auto min-w-32">
          <DropdownMenuItem onClick={onCopyJSON}>Copy JSON</DropdownMenuItem>
          <DropdownMenuItem onClick={onExportJSON}>Export as JSON</DropdownMenuItem>
          <DropdownMenuItem onClick={onExportCSV}>Export as CSV</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
