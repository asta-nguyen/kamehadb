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
  totalCount: number;
  pageSize: number;
  hasMore: boolean;
  isFetching?: boolean;
  onPageChange: (page: number) => void;
  onExportJSON: () => void;
  onExportCSV: () => void;
  className?: string;
}

export function DataFooter({
  rowCount,
  durationMs,
  page,
  totalCount,
  pageSize,
  hasMore,
  isFetching,
  onPageChange,
  onExportJSON,
  onExportCSV,
  className,
}: DataFooterProps) {
  const maxPage = Math.max(0, Math.ceil(totalCount / pageSize) - 1);
  return (
    <div
      className={`px-3 py-1.5 text-xs text-muted-foreground border-t bg-muted/30 flex items-center gap-3 ${
        className ?? ''
      }`}
    >
      <span>{rowCount} rows</span>
      <span className="ml-auto">{durationMs}ms</span>
      {isFetching && (
        <span className="flex items-center text-muted-foreground gap-1">
          <Spinner size="sm" />
          Loading...
        </span>
      )}
      <div className="flex items-center gap-2">
        <div className="flex items-center text-xs text-muted-foreground gap-1">
          <span>Page</span>
          <Input
            type="number"
            min={1}
            value={page + 1}
            onChange={(e) => {
              const p = parseInt(e.target.value, 10);
              if (!isNaN(p) && p >= 1) onPageChange(Math.min(p - 1, maxPage));
            }}
            className="h-7 w-14 text-xs text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={page === 0}
            onClick={() => onPageChange(Math.max(0, page - 1))}
          >
            <ChevronLeft className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon-sm" disabled={!hasMore} onClick={() => onPageChange(page + 1)}>
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger className="inline-flex items-center justify-center px-2.5 h-7 text-xs font-medium bg-clip-padding rounded-lg border-transparent outline-hidden transition-all whitespace-nowrap select-none border gap-1 shrink-0 hover:text-foreground hover:bg-muted aria-expanded:text-foreground aria-expanded:bg-muted dark:hover:bg-muted/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5 [&_svg]:pointer-events-none [&_svg]:shrink-0">
          <Download className="size-3" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onExportJSON}>Export as JSON</DropdownMenuItem>
          <DropdownMenuItem onClick={onExportCSV}>Export as CSV</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
