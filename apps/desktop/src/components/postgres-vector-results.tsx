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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DataTable, type ColumnDef } from '@/components/data-table';
import { Check, Copy, FileJson, Eye, Network, MoreVertical } from 'lucide-react';

type PostgresVectorResultsProps = {
  readonly result: PostgresVectorSearchResult;
  readonly onViewMap?: () => void;
};

function formatJsonSyntax(json: string): React.ReactNode[] {
  const lines = json.split('\n');
  return lines.map((line, i) => {
    const parts: React.ReactNode[] = [];
    let lastIdx = 0;
    const regex =
      /("[^"\\]*(?:\\.[^"\\]*)*")(?=\s*:)|:\s*("[^"\\]*(?:\\.[^"\\]*)*")|:\s*(true|false)|:\s*(null)|:\s*(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(line)) !== null) {
      parts.push(line.slice(lastIdx, match.index));
      if (match[1]) {
        parts.push(
          <span key={`k-${i}-${parts.length}`} className="text-primary">
            {match[1]}
          </span>,
        );
      } else if (match[2]) {
        parts.push(
          <span key={`s-${i}-${parts.length}`}>
            : <span className="text-muted-foreground">{match[2]}</span>
          </span>,
        );
      } else if (match[3]) {
        parts.push(
          <span key={`b-${i}-${parts.length}`}>
            : <span className="text-accent-foreground">{match[3]}</span>
          </span>,
        );
      } else if (match[4]) {
        parts.push(
          <span key={`n-${i}-${parts.length}`}>
            : <span className="text-muted-foreground italic">{match[4]}</span>
          </span>,
        );
      } else if (match[5]) {
        parts.push(
          <span key={`num-${i}-${parts.length}`}>
            : <span className="text-foreground">{match[5]}</span>
          </span>,
        );
      }
      lastIdx = regex.lastIndex;
    }
    parts.push(line.slice(lastIdx));
    return (
      <div key={`${i}-${line.slice(0, 50)}`} className="flex">
        <span className="w-8 shrink-0 text-right text-xs text-muted-foreground/40 select-none mr-3">{i + 1}</span>
        <span className="flex-1">{parts}</span>
      </div>
    );
  });
}

function RecordDetailTabs({ selectedRow }: { readonly selectedRow: Record<string, unknown> | null }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!selectedRow) return;
    await navigator.clipboard.writeText(JSON.stringify(selectedRow, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [selectedRow]);

  const json = useMemo(() => JSON.stringify(selectedRow ?? {}, null, 2), [selectedRow]);

  return (
    <Tabs defaultValue="view" className="flex-1 flex flex-col min-h-0">
      <div className="shrink-0 px-4 pb-2">
        <TabsList variant="notebook">
          <TabsTrigger value="view" className="text-xs">
            <Eye className="size-3 mr-1" />
            View
          </TabsTrigger>
          <TabsTrigger value="json" className="text-xs">
            <FileJson className="size-3 mr-1" />
            JSON
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="view" className="flex-1 min-h-0 p-0">
        <div className="h-full overflow-y-auto">
          {selectedRow ? (
            <div className="space-y-1.5 p-2">
              {Object.entries(selectedRow).map(([key, value], i) => {
                const typeLabel = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
                return (
                  <div key={key} className={`flex items-start gap-3 px-4 py-2 ${i % 2 === 0 ? 'bg-muted/20' : ''}`}>
                    <div className="w-2/5 shrink-0 min-w-0">
                      <div className="text-xs font-medium truncate">{key}</div>
                      <span className="text-xs uppercase text-muted-foreground/50 tracking-wider">{typeLabel}</span>
                    </div>
                    <div className="flex-1 min-w-0 text-sm font-mono break-all leading-snug group/field">
                      {value === null ? (
                        <span className="text-muted-foreground italic">null</span>
                      ) : typeof value === 'object' ? (
                        <pre className="text-xs whitespace-pre-wrap bg-muted/50 rounded p-2 mt-0.5 max-h-32 overflow-auto">
                          {JSON.stringify(value, null, 2)}
                        </pre>
                      ) : (
                        <span className="text-foreground/90">{String(value)}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-3 font-mono text-xs leading-relaxed bg-card text-muted-foreground rounded-sm m-2">
              No row selected.
            </div>
          )}
        </div>
      </TabsContent>
      <TabsContent value="json" className="flex-1 min-h-0 p-0">
        <div className="relative h-full overflow-y-auto">
          <Button variant="outline" size="icon-sm" className="absolute top-2 right-2 z-10" onClick={handleCopy}>
            {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
          </Button>
          <pre className="p-3 font-mono text-xs leading-relaxed bg-card text-muted-foreground rounded-sm m-2 overflow-auto">
            {formatJsonSyntax(json)}
          </pre>
        </div>
      </TabsContent>
    </Tabs>
  );
}

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
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onViewMap}>
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
