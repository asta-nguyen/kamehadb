import { MiddleTruncate } from '@/components/middle-truncate';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useColumnResize } from '@/hooks/use-column-resize';
import { useVirtualizer } from '@tanstack/react-virtual';
import { cn } from 'cnfast';
import { ArrowDown, ArrowUp, ArrowUpDown, Table2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

export type SortDirection = 'asc' | 'desc';

export type ColumnDef<T> = {
  id: string;
  header: ReactNode;
  accessor: (row: T) => unknown;
  render?: (value: unknown, row: T, rowIndex: number) => ReactNode;
  cellClassName?: string;
  headerClassName?: string;
  sortable?: boolean;
};

export type DataTableProps<T> = {
  rows: T[];
  columns: ColumnDef<T>[];
  rowKey: (row: T, index: number) => string;
  prefix?: (row: T, rowIndex: number) => ReactNode;
  prefixHeader?: ReactNode;
  prefixWidth?: string;
  prefixHeaderClassName?: string;
  prefixCellClassName?: string;
  showIndex?: boolean;
  indexOffset?: number;
  indexWidth?: string;
  suffix?: (row: T, rowIndex: number) => ReactNode;
  suffixHeader?: ReactNode;
  suffixWidth?: string;
  suffixHeaderClassName?: string;
  suffixCellClassName?: string;
  fixedTemplate?: string;
  stickyHeader?: boolean;
  scrollElement?: HTMLElement | null | (() => HTMLElement | null);
  onRowClick?: (row: T, index: number, event: React.MouseEvent) => void;
  onSortChange?: (columnId: string) => void;
  sortColumn?: string;
  sortDirection?: SortDirection;
  rowClassName?: string | ((row: T, index: number) => string | undefined);
  bodyClassName?: string;
  className?: string;
  emptyMessage?: ReactNode;
};

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  prefix,
  prefixHeader,
  prefixWidth = '56px',
  prefixHeaderClassName,
  prefixCellClassName,
  showIndex = false,
  indexOffset = 0,
  indexWidth = '32px',
  suffix,
  suffixHeader,
  suffixWidth = '80px',
  suffixHeaderClassName,
  suffixCellClassName,
  fixedTemplate,
  stickyHeader = false,
  scrollElement,
  onRowClick,
  onSortChange,
  sortColumn,
  sortDirection,
  rowClassName,
  bodyClassName,
  className,
  emptyMessage,
}: DataTableProps<T>) {
  const innerRef = useRef<HTMLDivElement>(null);
  const useResize = fixedTemplate === undefined;

  // Dynamically compute index column width based on digit count to prevent overflow
  // on deep offsets (e.g. offset > 10,000 or 1,000,000). (How / Why / What)
  const maxRowIndex = indexOffset + rows.length;
  const digits = Math.max(2, String(maxRowIndex).length);
  const effectiveIndexWidth = indexWidth !== '32px' ? indexWidth : `${Math.max(40, digits * 8 + 24)}px`;

  // Sample up to 50 rows of body content per column for content-based sizing.
  const sampleValues =
    rows.length > 0
      ? columns.map((col) => {
          const sample = rows.slice(0, 50);
          return sample.map((row) => {
            const value = col.accessor(row);
            if (value === null || value === undefined) return '';
            if (typeof value === 'object') return JSON.stringify(value);
            return String(value);
          });
        })
      : undefined;
  const { fullTemplate, onMouseDown: onColResize } = useColumnResize(columns.length, {
    prefix: [prefix ? prefixWidth : '', showIndex ? effectiveIndexWidth : ''].filter(Boolean).join(' '),
    suffix: suffix ? suffixWidth : '',
    sampleValues,
    columnIds: columns.map((col) => col.id),
    headers: columns.map((col) => (typeof col.header === 'string' ? col.header : '')),
  });
  const gridTemplateColumns = fixedTemplate ?? fullTemplate;

  const resolveRowClass = useCallback(
    (row: T, index: number) => {
      if (typeof rowClassName === 'function') return rowClassName(row, index);
      return rowClassName;
    },
    [rowClassName],
  );

  // Locate the closest scrollable container so virtualization tracks the real viewport.
  // Walks up ancestors if scrollElement is unspecified, falling back to innerRef. (How / Why / What)
  const getScrollParent = useCallback(() => {
    if (scrollElement) {
      return typeof scrollElement === 'function' ? scrollElement() : scrollElement;
    }
    let el = innerRef.current?.parentElement;
    while (el) {
      const overflowY = window.getComputedStyle(el).overflowY;
      if (overflowY === 'auto' || overflowY === 'scroll') {
        return el;
      }
      el = el.parentElement;
    }
    return innerRef.current;
  }, [scrollElement]);

  // Window body rows when exceeding 200 rows to avoid allocating thousands of DOM nodes.
  // Below that the whole page renders once, so scrolling costs no React work per frame.
  // scrollMargin accounts for elements positioned above the table inside the same scroll parent. (How / Why / What)
  const isVirtualized = rows.length > 200;
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: getScrollParent,
    estimateSize: () => 33,
    overscan: 10,
    scrollMargin: innerRef.current ? innerRef.current.offsetTop : 0,
    enabled: isVirtualized,
  });

  const virtualItems = isVirtualized ? rowVirtualizer.getVirtualItems() : null;
  const totalSize = isVirtualized ? rowVirtualizer.getTotalSize() : 0;
  // Subtract scrollMargin from virtualItems[0].start to get relative offset within the table,
  // preventing a large empty band between header and first row when table has an offset in scroll parent. (How / Why / What)
  const scrollMargin = rowVirtualizer.options.scrollMargin ?? 0;
  const paddingTop = virtualItems && virtualItems.length > 0 ? Math.max(0, virtualItems[0].start - scrollMargin) : 0;
  const paddingBottom =
    virtualItems && virtualItems.length > 0
      ? Math.max(0, totalSize - (virtualItems[virtualItems.length - 1].end - scrollMargin))
      : 0;

  const defaultHeaderClass = 'bg-muted px-3 py-1 font-semibold text-foreground text-xs';

  const renderRow = (row: T, rowIndex: number, measureRef?: (el: HTMLElement | null) => void) => {
    const key = rowKey(row, rowIndex);
    const extraClass = resolveRowClass(row, rowIndex);
    return (
      <TableRow
        key={key}
        ref={measureRef}
        data-index={rowIndex}
        style={{ gridTemplateColumns }}
        className={cn(
          'border-b border-border/40 last:border-b-0 bg-background even:bg-muted/10 hover:bg-muted/20 transition-colors',
          onRowClick && 'cursor-pointer',
          extraClass,
        )}
        onClick={onRowClick ? (e) => onRowClick(row, rowIndex, e) : undefined}
      >
        {prefix && (
          <TableCell className={cn('sticky left-0 z-20 px-2 py-1 flex items-center bg-inherit', prefixCellClassName)}>
            {prefix(row, rowIndex)}
          </TableCell>
        )}
        {showIndex && (
          <TableCell className="px-2 py-1 flex items-center justify-end text-muted-foreground tabular-nums select-none truncate">
            {indexOffset + rowIndex + 1}
          </TableCell>
        )}
        {columns.map((col) => {
          const value = col.accessor(row);
          const title =
            value === null || value === undefined
              ? ''
              : typeof value === 'object'
                ? JSON.stringify(value)
                : String(value);
          return (
            // Tooltips only help when the value is long enough to be cut off; short values are visible in place. (Why)
            <TableCell
              key={col.id}
              className={cn(
                'px-2 py-1 flex items-center overflow-hidden min-w-0',
                typeof value === 'object' && value !== null && 'overflow-visible whitespace-normal',
                col.cellClassName,
              )}
              title={title.length > 20 ? title : undefined}
            >
              {col.render ? col.render(value, row, rowIndex) : defaultCellRender(value)}
            </TableCell>
          );
        })}
        {suffix && (
          <TableCell className={cn('px-2 py-1 flex items-center justify-center bg-inherit', suffixCellClassName)}>
            {suffix(row, rowIndex)}
          </TableCell>
        )}
      </TableRow>
    );
  };

  // Keep the pinned header aligned with the body's horizontal scroll; the header lives
  // outside the scrollport so the vertical scrollbar spans only the body rows. (How / Why / What)
  const headerRef = useRef<HTMLDivElement>(null);
  const syncHeaderScroll = (scroller: HTMLDivElement) => {
    // Only write when it changed: a no-op write on every vertical scroll event is wasted
    // style work in the web process, which the overlay bar's fade is composited with. (Why)
    const header = headerRef.current;
    if (header && header.scrollLeft !== scroller.scrollLeft) header.scrollLeft = scroller.scrollLeft;
  };

  // Classic (non-overlay) scrollbars eat width from the body scrollport; pad the header
  // by the same amount so its columns stay aligned with the rows. Overlay bars add none. (How / Why)
  useEffect(() => {
    const scroller = innerRef.current;
    const header = headerRef.current;
    if (scroller && header) {
      header.style.paddingRight = `${scroller.offsetWidth - scroller.clientWidth}px`;
    }
  }, [gridTemplateColumns, rows.length]);

  const headerRow = (
    <TableHeader className="bg-muted">
      <TableRow style={{ gridTemplateColumns }}>
        {prefix && (
          <TableHead className={cn(defaultHeaderClass, prefixHeaderClassName, 'sticky left-0 z-30 min-w-0 bg-muted')}>
            {prefixHeader ?? ''}
          </TableHead>
        )}
        {showIndex && <TableHead className={cn(defaultHeaderClass, 'text-right pr-2')}>#</TableHead>}
        {columns.map((col, i) => {
          const isSorted = sortColumn === col.id;
          const clickable = !!col.sortable && !!onSortChange;
          return (
            <TableHead
              key={col.id}
              onClick={clickable ? () => onSortChange!(col.id) : undefined}
              className={cn(
                defaultHeaderClass,
                'relative min-w-0',
                clickable && 'group/head cursor-pointer select-none hover:bg-muted/80',
                isSorted && 'text-foreground',
                col.headerClassName,
              )}
            >
              <div className="flex items-center pr-2 gap-1 overflow-hidden min-w-0">
                <span className="truncate" title={typeof col.header === 'string' ? col.header : undefined}>
                  {col.header}
                </span>
                {isSorted &&
                  (sortDirection === 'asc' ? (
                    <ArrowUp className="shrink-0 size-3" />
                  ) : (
                    <ArrowDown className="shrink-0 size-3" />
                  ))}
                {/* Sorting now lives on the headers, so a hover glyph keeps it discoverable. (Why) */}
                {clickable && !isSorted && (
                  <ArrowUpDown className="shrink-0 size-3 opacity-0 transition-opacity group-hover/head:opacity-50" />
                )}
              </div>
              {useResize && <ResizeHandle index={i} header={col.header} onColResize={onColResize} />}
            </TableHead>
          );
        })}
        {suffix && (
          <TableHead className={cn(defaultHeaderClass, suffixHeaderClassName, 'min-w-0 text-center')}>
            {suffixHeader ?? ''}
          </TableHead>
        )}
      </TableRow>
    </TableHeader>
  );

  // Outer div fills parent flex area with rounded corners. The scrollport holds only the
  // body rows, so the bar hangs on the body instead of spanning the pinned header. (How / Why / What)
  return (
    <div data-slot="data-table" className="w-full flex-1 min-h-0 flex flex-col rounded-md overflow-hidden">
      {stickyHeader && rows.length > 0 && (
        <div
          ref={headerRef}
          className="shrink-0 overflow-hidden bg-muted"
          // The header sits outside the scrollport, so a wheel over it would hit a dead
          // strip; forward both axes to the body to keep scrolling as before. (How / Why)
          onWheel={(e) => innerRef.current?.scrollBy(e.deltaX, e.deltaY)}
        >
          <Table className={cn('w-full text-xs', className)}>{headerRow}</Table>
        </div>
      )}
      <div
        ref={innerRef}
        data-slot="data-table-scrollport"
        onScroll={(e) => syncHeaderScroll(e.currentTarget)}
        className="flex-1 min-h-0 overflow-auto [scrollbar-width:thin] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/40 [&::-webkit-scrollbar-thumb:hover]:bg-muted-foreground/60 [&::-webkit-scrollbar-track]:bg-muted/30"
      >
        <Table className={cn('w-full text-xs', className)}>
          {rows.length > 0 ? (
            <>
              {!stickyHeader && headerRow}
              <TableBody className={cn(bodyClassName)}>
                {rows.length === 0 ? (
                  emptyMessage ? (
                    <TableRow style={{ gridTemplateColumns: '1fr' }} className="bg-background">
                      <TableCell className="py-8 text-muted-foreground">{emptyMessage}</TableCell>
                    </TableRow>
                  ) : (
                    <TableRow style={{ gridTemplateColumns: '1fr' }} className="bg-background">
                      <TableCell className="py-16 text-muted-foreground">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Table2 className="size-8 opacity-40" />
                          <p className="text-sm">No data</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                ) : isVirtualized && virtualItems ? (
                  <>
                    {paddingTop > 0 && <div style={{ height: `${paddingTop}px`, border: 0 }} aria-hidden />}
                    {virtualItems.map((virtualRow) => {
                      const row = rows[virtualRow.index];
                      if (!row) return null;
                      return renderRow(row, virtualRow.index, rowVirtualizer.measureElement);
                    })}
                    {paddingBottom > 0 && <div style={{ height: `${paddingBottom}px`, border: 0 }} aria-hidden />}
                  </>
                ) : (
                  rows.map((row, rowIndex) => renderRow(row, rowIndex))
                )}
              </TableBody>
            </>
          ) : emptyMessage ? (
            <TableBody className={cn(bodyClassName)}>
              <TableRow style={{ gridTemplateColumns: '1fr' }} className="bg-background">
                <TableCell className="py-8 text-muted-foreground">{emptyMessage}</TableCell>
              </TableRow>
            </TableBody>
          ) : (
            <TableBody className={cn(bodyClassName)}>
              <TableRow style={{ gridTemplateColumns: '1fr' }} className="bg-background">
                <TableCell className="py-16 text-muted-foreground">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Table2 className="size-8 opacity-40" />
                    <p className="text-sm">No data</p>
                  </div>
                </TableCell>
              </TableRow>
            </TableBody>
          )}
        </Table>
      </div>
    </div>
  );
}

function defaultCellRender(value: unknown): ReactNode {
  if (value === null) return <span className="truncate text-muted-foreground italic">null</span>;
  if (value === undefined) return <span className="truncate text-muted-foreground">-</span>;
  if (typeof value === 'object')
    return <MiddleTruncate text={JSON.stringify(value)} className="text-primary font-mono" />;
  return <MiddleTruncate text={String(value)} />;
}

// Resize handle extracted into its own component so it can hold the hover/drag
// state needed to keep the indicator visible while dragging fast past the strip.
function ResizeHandle({
  index,
  header,
  onColResize,
}: {
  index: number;
  header: ReactNode;
  onColResize: (index: number, e: React.MouseEvent) => void;
}) {
  // Track hover separately from CSS :hover so the indicator stays lit when
  // the cursor moves off the narrow strip during a fast drag.
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    onColResize(index, e);
    // Clean up drag state on mouseup regardless of where the cursor is.
    const onUp = () => {
      setIsDragging(false);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mouseup', onUp);
  };

  return (
    <div
      data-resize-handle
      data-col-index={index}
      data-resizing={isDragging ? '' : undefined}
      onMouseDown={handleMouseDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={(e) => e.stopPropagation()}
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize column ${header}`}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onColResize(index, e as unknown as React.MouseEvent);
        }
      }}
      className="group absolute bottom-0 right-0 top-0 z-10 w-2.5 cursor-col-resize flex items-center justify-center active:bg-primary/[0.08]"
    >
      {/* Indicator bar: wider on hover, persists as primary colour while dragging. */}
      <div
        className={cn(
          'h-full transition-all rounded-full',
          isDragging ? 'w-0.5 bg-primary' : isHovered ? 'w-0.5 bg-primary/50' : 'w-px bg-border/60',
        )}
      />
    </div>
  );
}
