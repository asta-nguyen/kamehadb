import { useCallback, useMemo, type ReactNode } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useColumnResize } from '@/hooks/use-column-resize';
import { cn } from '@/lib/utils';
import { ArrowDown, ArrowUp } from 'lucide-react';

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
  showIndex?: boolean;
  indexOffset?: number;
  indexWidth?: string;
  suffix?: (row: T, rowIndex: number) => ReactNode;
  suffixHeader?: ReactNode;
  suffixWidth?: string;
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
  showIndex = false,
  indexOffset = 0,
  indexWidth = '32px',
  suffix,
  suffixHeader,
  suffixWidth = '80px',
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
  // Resize hook is always called with the same shape (columns.length) so the
  // grid template stays consistent whether or not a fixedTemplate is supplied.
  // When fixedTemplate is provided the returned fullTemplate is ignored.
  const { fullTemplate, onMouseDown: onColResize } = useColumnResize(useResize ? columns.length : columns.length, {
    prefix: showIndex ? indexWidth : '',
    suffix: suffix ? suffixWidth : '',
  });
  const gridTemplateColumns = fixedTemplate ?? fullTemplate;

  const resolveRowClass = useCallback(
    (row: T, index: number) => {
      if (typeof rowClassName === 'function') return rowClassName(row, index);
      return rowClassName;
    },
    [rowClassName],
  );

  const defaultHeaderClass = useMemo(() => 'bg-muted px-2 py-1 font-semibold text-foreground text-[11px]', []);

  return (
    <Table className={cn('text-xs', className)}>
      {rows.length > 0 && (
        <TableHeader className={cn(stickyHeader && 'sticky top-0 z-10 bg-muted/50 backdrop-blur')}>
          <TableRow style={{ gridTemplateColumns }} className={cn(!stickyHeader && 'bg-muted')}>
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
                    'relative',
                    clickable && 'cursor-pointer select-none hover:bg-muted/80',
                    isSorted && 'text-foreground',
                    col.headerClassName,
                  )}
                >
                  <div className="flex items-center gap-1 overflow-hidden pr-2">
                    <span className="truncate" title={typeof col.header === 'string' ? col.header : undefined}>
                      {col.header}
                    </span>
                    {isSorted &&
                      (sortDirection === 'asc' ? (
                        <ArrowUp className="size-3 shrink-0" />
                      ) : (
                        <ArrowDown className="size-3 shrink-0" />
                      ))}
                  </div>
                  {useResize && (
                    <div
                      data-resize-handle
                      data-col-index={i}
                      onMouseDown={(e) => onColResize(i, e)}
                      onClick={(e) => e.stopPropagation()}
                      className="absolute top-0 right-0 bottom-0 w-1.5 cursor-col-resize z-10 hover:bg-primary/30 active:bg-primary/50"
                    />
                  )}
                </TableHead>
              );
            })}
            {suffix && <TableHead className={defaultHeaderClass}>{suffixHeader ?? ''}</TableHead>}
          </TableRow>
        </TableHeader>
      )}
      <TableBody className={bodyClassName}>
        {rows.length === 0 ? (
          <TableRow style={{ gridTemplateColumns: '1fr' }} className="bg-background">
            <TableCell className="text-center text-muted-foreground py-8">{emptyMessage ?? 'No data'}</TableCell>
          </TableRow>
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
                {showIndex && (
                  <TableCell className="px-2 py-0.5 text-muted-foreground">{indexOffset + rowIndex + 1}</TableCell>
                )}
                {columns.map((col) => {
                  const value = col.accessor(row);
                  const title = col.render
                    ? undefined
                    : value === null || value === undefined
                      ? ''
                      : typeof value === 'object'
                        ? JSON.stringify(value)
                        : String(value);
                  return (
                    <TableCell
                      key={col.id}
                      className={cn('px-1 py-1 overflow-hidden truncate', col.cellClassName)}
                      title={title}
                    >
                      {col.render ? col.render(value, row, rowIndex) : defaultCellRender(value)}
                    </TableCell>
                  );
                })}
                {suffix && <TableCell className="px-1 py-1">{suffix(row, rowIndex)}</TableCell>}
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
}

function defaultCellRender(value: unknown): ReactNode {
  if (value === null) return <span className="text-muted-foreground italic">null</span>;
  if (value === undefined) return <span className="text-muted-foreground">-</span>;
  if (typeof value === 'object') return <span className="text-primary">{JSON.stringify(value)}</span>;
  return <span>{String(value)}</span>;
}
