import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { JsonValue } from '@/components/ui/json-value';
import { useColumnResize } from '@/hooks/use-column-resize';
import { cn } from 'cnfast';
import { ArrowDown, ArrowUp, Table2 } from 'lucide-react';
import { useCallback, useState, type ReactNode } from 'react';

export type SortDirection = 'asc' | 'desc';

export interface ColumnDef<T> {
  id: string;
  header: ReactNode;
  accessor: (row: T) => unknown;
  render?: (value: unknown, row: T, rowIndex: number) => ReactNode;
  cellClassName?: string;
  headerClassName?: string;
  sortable?: boolean;
}

export interface DataTableProps<T> {
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
  onRowClick?: (row: T, index: number) => void;
  onSortChange?: (columnId: string) => void;
  sortColumn?: string;
  sortDirection?: SortDirection;
  rowClassName?: string | ((row: T, index: number) => string | undefined);
  bodyClassName?: string;
  className?: string;
  emptyMessage?: ReactNode;
}

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
  onRowClick,
  onSortChange,
  sortColumn,
  sortDirection,
  rowClassName,
  bodyClassName,
  className,
  emptyMessage,
}: DataTableProps<T>) {
  const useResize = fixedTemplate === undefined;
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
    prefix: [prefix ? prefixWidth : '', showIndex ? indexWidth : ''].filter(Boolean).join(' '),
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

  const defaultHeaderClass = 'bg-muted px-3 py-1 font-semibold text-foreground text-xs';

  // Outer div clips children to rounded corners via overflow-hidden.
  // Inner div handles horizontal scroll independently of the clip boundary.
  return (
    <div className="w-full rounded-md overflow-hidden">
      <div className="overflow-auto [scrollbar-width:thin] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/40 [&::-webkit-scrollbar-thumb:hover]:bg-muted-foreground/60 [&::-webkit-scrollbar-track]:bg-muted/30">
        <Table className={cn('w-full text-xs', className)}>
          {rows.length > 0 ? (
            <>
              <TableHeader className={cn(stickyHeader && 'sticky top-0 z-10 bg-muted/50 backdrop-blur')}>
                <TableRow style={{ gridTemplateColumns }} className={cn(!stickyHeader && 'bg-muted')}>
                  {prefix && (
                    <TableHead
                      className={cn(defaultHeaderClass, prefixHeaderClassName, 'sticky left-0 z-30 min-w-0 bg-muted')}
                    >
                      {prefixHeader ?? ''}
                    </TableHead>
                  )}
                  {showIndex && <TableHead className={defaultHeaderClass}>#</TableHead>}
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
                          clickable && 'cursor-pointer select-none hover:bg-muted/80',
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
                ) : (
                  rows.map((row, rowIndex) => {
                    const key = rowKey(row, rowIndex);
                    const extraClass = resolveRowClass(row, rowIndex);
                    return (
                      <TableRow
                        key={key}
                        style={{ gridTemplateColumns }}
                        className={cn(
                          'border-b border-border/40 last:border-b-0 bg-background even:bg-muted/10 hover:bg-muted/20 transition-colors',
                          onRowClick && 'cursor-pointer',
                          extraClass,
                        )}
                        onClick={onRowClick ? () => onRowClick(row, rowIndex) : undefined}
                      >
                        {prefix && (
                          <TableCell className={cn('sticky left-0 z-20 px-2 py-1 bg-inherit', prefixCellClassName)}>
                            {prefix(row, rowIndex)}
                          </TableCell>
                        )}
                        {showIndex && (
                          <TableCell className="px-3 py-1 text-muted-foreground tabular-nums">
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
                            <TableCell
                              key={col.id}
                              className={cn(
                                'px-2 py-1 overflow-hidden truncate min-w-0',
                                typeof value === 'object' && value !== null && 'overflow-visible whitespace-normal',
                                col.cellClassName,
                              )}
                              title={title}
                            >
                              {col.render ? col.render(value, row, rowIndex) : defaultCellRender(value)}
                            </TableCell>
                          );
                        })}
                        {suffix && (
                          <TableCell
                            className={cn('px-2 py-1 flex items-center justify-center bg-inherit', suffixCellClassName)}
                          >
                            {suffix(row, rowIndex)}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })
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
  if (value === null) return <span className="text-muted-foreground italic">null</span>;
  if (value === undefined) return <span className="text-muted-foreground">-</span>;
  if (typeof value === 'object') return <JsonValue value={value} />;
  return <span>{String(value)}</span>;
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
