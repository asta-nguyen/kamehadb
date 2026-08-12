import { useCallback, useMemo, useState } from 'react';
import type { PostgresVectorSearchResult } from '@kamehadb/shared';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { DataTable, type ColumnDef } from '@/components/data-table';
import { Copy, FileJson, Eye, Network, MoreVertical } from 'lucide-react';
import { RecordDetailTabs } from '@/components/record-detail-tabs';

type PostgresVectorResultsProps = {
  readonly result: PostgresVectorSearchResult;
  readonly onViewMap?: () => void;
};

export function PostgresVectorResults({ result, onViewMap }: PostgresVectorResultsProps) {
  const [selectedRow, setSelectedRow] = useState<Record<string, unknown> | null>(null);

  const rows = useMemo(
    () =>
      result.hits.map((hit) => ({
        id: hit.id,
        score: hit.score,
        row: hit.row,
      })),
    [result.hits],
  );

  // Build columns dynamically from row keys, plus ID and Score
  const columns: ColumnDef<{ id: string | number; score: number; row: Record<string, unknown> }>[] = useMemo(() => {
    const rowKeys = result.hits.length > 0 ? Object.keys(result.hits[0].row).filter((k) => k !== 'rowid') : [];

    const dataCols: ColumnDef<{ id: string | number; score: number; row: Record<string, unknown> }>[] = rowKeys.map(
      (key) => ({
        id: key,
        header: key,
        accessor: (row) => row.row[key],
        headerClassName: 'px-3 py-1.5 font-medium h-auto',
        cellClassName: 'px-3 py-1.5 font-mono text-xs truncate max-w-48',
        render: (value) => {
          const str = value === null ? 'null' : typeof value === 'object' ? JSON.stringify(value) : String(value);
          return (
            <span className="truncate block" title={str}>
              {str}
            </span>
          );
        },
      }),
    );

    return [
      ...dataCols,
      {
        id: 'id',
        header: 'ID',
        accessor: (row) => row.id,
        headerClassName: 'px-3 py-1.5 font-medium h-auto',
        cellClassName: 'px-3 py-1.5 font-mono text-muted-foreground truncate max-w-24',
        render: (value) => (
          <span className="truncate block" title={String(value)}>
            {String(value)}
          </span>
        ),
      },
      {
        id: 'score',
        header: 'Score',
        accessor: (row) => row.score,
        headerClassName: 'px-3 py-1.5 font-medium h-auto',
        cellClassName: 'px-3 py-1.5 font-mono',
        render: (value) => <span>{(value as number).toFixed(6)}</span>,
      },
    ];
  }, [result.hits]);

  const openRow = useCallback((row: { id: string | number; score: number; row: Record<string, unknown> }) => {
    setSelectedRow({ ...row.row, id: row.id, score: row.score });
  }, []);

  const selectedRowIndex = useMemo(() => {
    if (!selectedRow) return -1;
    return rows.findIndex((row) => String(row.id) === String(selectedRow.id));
  }, [rows, selectedRow]);

  return (
    <>
      <div className="min-h-0 flex flex-col border border-border rounded-md overflow-hidden">
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(row) => String(row.id)}
          stickyHeader
          emptyMessage="No results"
          onRowClick={(row) => openRow(row)}
          suffixHeader="Actions"
          suffixWidth="64px"
          suffix={(row) => (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
                <MoreVertical className="size-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onClick={() => openRow(row)}>
                  <Eye className="size-3.5 mr-2" />
                  View details
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigator.clipboard.writeText(JSON.stringify(row.row, null, 2))}>
                  <Copy className="size-3.5 mr-2" />
                  Copy row
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        />
        <div className="px-3 py-1.5 border-t border-border text-xs text-muted-foreground flex items-center gap-2">
          {onViewMap && (
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={onViewMap}>
              <Network className="size-3.5 mr-1.5" />
              View map
            </Button>
          )}
          <span className={onViewMap ? 'ml-auto' : ''}>
            {result.hits.length} results in {result.durationMs}ms
          </span>
        </div>
      </div>
      <Sheet
        open={selectedRow !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedRow(null);
        }}
      >
        <SheetContent className="sm:max-w-lg flex flex-col">
          <SheetHeader className="shrink-0">
            <SheetTitle className="flex items-center gap-2">
              <FileJson className="size-4" />
              Record{selectedRowIndex >= 0 ? ` #${selectedRowIndex + 1}` : ''}
            </SheetTitle>
          </SheetHeader>
          <RecordDetailTabs selectedRow={selectedRow} />
        </SheetContent>
      </Sheet>
    </>
  );
}
