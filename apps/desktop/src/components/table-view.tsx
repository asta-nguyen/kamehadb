import { useState, useMemo, useCallback } from 'react';
import { useReactTable, getCoreRowModel, flexRender, type ColumnDef } from '@tanstack/react-table';
import { useTableColumns, useTableIndexes, usePreviewRows } from '@/hooks/use-schema';
import { TableStats } from '@/components/table-stats';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';

import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import {
  Loader2,
  Key,
  Hash,
  Table2,
  ChevronLeft,
  ChevronRight,
  FileJson,
  Copy,
  Check,
  Activity,
  Download,
} from 'lucide-react';
import { downloadResult } from '@/lib/export';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const PAGE_SIZE = 50;

type TableViewProps = {
  connectionId: string;
  tableId: string;
};

function DataGrid({ connectionId, tableId }: { connectionId: string; tableId: string }) {
  const [offset, setOffset] = useState(0);
  const [selectedRow, setSelectedRow] = useState<Record<string, unknown> | null>(null);

  const { data: columns } = useTableColumns(connectionId, tableId);
  const { data: result, isLoading } = usePreviewRows(connectionId, {
    tableId,
    offset,
    limit: PAGE_SIZE,
  });

  const page = Math.floor(offset / PAGE_SIZE) + 1;

  const columnDefs = useMemo<ColumnDef<Record<string, unknown>>[]>(
    () =>
      (result?.columns ?? columns ?? []).map((col) => ({
        id: col.name,
        header: col.name,
        accessorFn: (row: Record<string, unknown>) => row[col.name],
        cell: ({ getValue }: { getValue: () => unknown }) => {
          const value = getValue();
          if (value === null) return <span className="text-muted-foreground italic">NULL</span>;
          if (value === undefined) return <span className="text-muted-foreground">-</span>;
          return String(value);
        },
        size: 150,
      })),
    [result, columns],
  );

  const table = useReactTable({
    data: result?.rows ?? [],
    columns: columnDefs,
    getCoreRowModel: getCoreRowModel(),
  });

  const headerGroups = table.getHeaderGroups();
  const gridTemplate =
    headerGroups.length > 0 ? `2rem ${headerGroups[0].headers.map((h) => `${h.getSize()}px`).join(' ')}` : undefined;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <div className="overflow-auto border rounded-md">
        <Table className="text-xs">
          <TableHeader>
            {headerGroups.map((headerGroup) => (
              <TableRow key={headerGroup.id} style={{ gridTemplateColumns: gridTemplate }}>
                <TableHead className="px-2 py-1 text-left bg-muted/50">#</TableHead>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="px-3 py-1 text-left bg-muted/50 border-r whitespace-nowrap">
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row, i) => (
              <TableRow
                key={row.id}
                className="cursor-pointer hover:bg-muted/30"
                style={{ gridTemplateColumns: gridTemplate }}
                onClick={() => setSelectedRow(row.original)}
              >
                <TableCell className="px-2 py-1 text-muted-foreground">{offset + i + 1}</TableCell>
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className="px-3 py-1 border-r last:border-r-0 truncate max-w-60"
                    title={String(cell.getValue() ?? '')}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {result && (
          <div className="px-3 py-1.5 text-xs text-muted-foreground border-t bg-muted/30 flex items-center gap-3">
            <span>{result.rowCount} rows</span>
            {result.truncated && (
              <Badge variant="outline" className="text-xs">
                Truncated
              </Badge>
            )}
            <span className="ml-auto">{result.durationMs}ms</span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={offset === 0}
                onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
              >
                <ChevronLeft className="size-3.5" />
              </Button>
              <span className="tabular-nums px-1">Page {page}</span>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={!result.truncated}
                onClick={() => setOffset((o) => o + PAGE_SIZE)}
              >
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-xs font-medium whitespace-nowrap transition-all outline-none select-none h-7 gap-1 hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50 px-2.5 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5">
                <Download className="size-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => {
                    downloadResult(result, 'csv');
                  }}
                >
                  Export as CSV
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    downloadResult(result, 'json');
                  }}
                >
                  Export as JSON
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    downloadResult(result, 'sql');
                  }}
                >
                  Export as SQL
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      <Sheet
        open={!!selectedRow}
        onOpenChange={(open) => {
          if (!open) setSelectedRow(null);
        }}
      >
        <SheetContent className="sm:max-w-lg flex flex-col">
          <SheetHeader className="shrink-0">
            <SheetTitle className="flex items-center gap-2">
              <FileJson className="size-4" />
              Record #{selectedRow ? offset + result?.rows.indexOf(selectedRow)! + 1 : ''}
            </SheetTitle>
          </SheetHeader>
          <RecordDetailTabs selectedRow={selectedRow} />
        </SheetContent>
      </Sheet>
    </>
  );
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatJsonSyntax(json: string): React.ReactNode[] {
  const lines = json.split('\n');
  return lines.map((line, i) => {
    const safeLine = escapeHtml(line);
    const colored = safeLine
      .replace(/(&quot;[^&]*&quot;)(?=\s*:)/g, '<span class="text-primary">$1</span>')
      .replace(/:\s*(&quot;[^&]*&quot;)/g, ': <span class="text-muted-foreground">$1</span>')
      .replace(/:\s*(true|false)/g, ': <span class="text-accent-foreground">$1</span>')
      .replace(/:\s*(null)/g, ': <span class="text-muted-foreground italic">$1</span>')
      .replace(/:\s*(\d+\.?\d*)/g, ': <span class="text-foreground">$1</span>');
    return (
      <div key={i} className="flex">
        <span className="w-8 shrink-0 text-right text-xs text-muted-foreground/40 select-none mr-3">{i + 1}</span>
        <span dangerouslySetInnerHTML={{ __html: colored || ' ' }} className="flex-1" />
      </div>
    );
  });
}

function RecordDetailTabs({ selectedRow }: { selectedRow: Record<string, unknown> | null }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!selectedRow) return;
    await navigator.clipboard.writeText(JSON.stringify(selectedRow, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [selectedRow]);

  if (!selectedRow) return null;

  return (
    <Tabs defaultValue="view" className="flex-1 flex flex-col min-h-0">
      <div className="shrink-0 px-4">
        <TabsList>
          <TabsTrigger value="view" className="text-xs">
            View
          </TabsTrigger>
          <TabsTrigger value="json" className="text-xs">
            JSON
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="view" className="flex-1 min-h-0 p-0">
        <div className="h-full overflow-y-auto">
          <div className="pb-2">
            {Object.entries(selectedRow).map(([key, value], i) => {
              const typeLabel = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
              return (
                <div key={key} className={`flex items-start gap-3 px-4 py-2 ${i % 2 === 0 ? 'bg-muted/20' : ''}`}>
                  <div className="w-2/5 shrink-0 min-w-0">
                    <div className="text-xs font-medium truncate">{key}</div>
                    <span className="text-xs uppercase text-muted-foreground/50 tracking-wider">{typeLabel}</span>
                  </div>
                  <div className="flex-1 min-w-0 text-sm font-mono break-all leading-snug">
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
        </div>
      </TabsContent>

      <TabsContent value="json" className="flex-1 min-h-0 p-0">
        <div className="relative h-full">
          <Button variant="outline" size="icon-sm" className="absolute top-2 right-2 z-10" onClick={handleCopy}>
            {copied ? <Check className="size-3.5 text-primary" /> : <Copy className="size-3.5" />}
          </Button>
          <div className="h-full overflow-y-auto">
            <div className="p-3 font-mono text-xs leading-relaxed bg-card text-muted-foreground rounded-sm m-2">
              {formatJsonSyntax(JSON.stringify(selectedRow, null, 2))}
            </div>
          </div>
        </div>
      </TabsContent>
    </Tabs>
  );
}

export function TableView({ connectionId, tableId }: TableViewProps) {
  const { data: columns } = useTableColumns(connectionId, tableId);
  const { data: indexes } = useTableIndexes(connectionId, tableId);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0">
        <Table2 className="size-4" />
        <span className="text-sm font-medium">{tableId}</span>
      </div>

      <Tabs defaultValue="data" className="flex-1 flex flex-col min-h-0">
        <div className="px-4 pt-2 shrink-0">
          <TabsList>
            <TabsTrigger value="data" className="text-xs">
              Data
            </TabsTrigger>
            <TabsTrigger value="columns" className="text-xs">
              Columns
            </TabsTrigger>
            <TabsTrigger value="indexes" className="text-xs">
              Indexes
            </TabsTrigger>
            <TabsTrigger value="stats" className="text-xs">
              <Activity className="size-3 mr-1" />
              Stats
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="data" className="flex-1 p-4 pt-2 overflow-auto">
          <DataGrid connectionId={connectionId} tableId={tableId} />
        </TabsContent>

        <TabsContent value="columns" className="flex-1 p-4 pt-2 overflow-auto">
          <div className="border rounded-md">
            <Table className="text-xs">
              <TableHeader>
                <TableRow className="bg-muted/50" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}>
                  <TableHead className="px-3 py-1.5">Name</TableHead>
                  <TableHead className="px-3 py-1.5">Type</TableHead>
                  <TableHead className="px-3 py-1.5">Nullable</TableHead>
                  <TableHead className="px-3 py-1.5">Default</TableHead>
                  <TableHead className="px-3 py-1.5">Key</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {columns?.map((col) => (
                  <TableRow key={col.name} style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}>
                    <TableCell className="px-3 py-1.5 font-medium">{col.name}</TableCell>
                    <TableCell className="px-3 py-1.5 text-muted-foreground">{col.type}</TableCell>
                    <TableCell className="px-3 py-1.5">{col.nullable ? 'YES' : 'NO'}</TableCell>
                    <TableCell className="px-3 py-1.5 text-muted-foreground font-mono text-xs">
                      {col.default ?? <span className="italic">null</span>}
                    </TableCell>
                    <TableCell className="px-3 py-1.5">
                      <div className="flex items-center gap-1">
                        {col.primaryKey && <Key className="size-3 text-muted-foreground" />}
                        {col.foreignKey && (
                          <span className="text-xs text-muted-foreground">
                            &rarr; {col.foreignKey.table}({col.foreignKey.column})
                          </span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="indexes" className="flex-1 p-4 pt-2 overflow-auto">
          <div className="border rounded-md">
            <Table className="text-xs">
              <TableHeader>
                <TableRow className="bg-muted/50" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
                  <TableHead className="px-3 py-1.5">Name</TableHead>
                  <TableHead className="px-3 py-1.5">Columns</TableHead>
                  <TableHead className="px-3 py-1.5">Unique</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {indexes?.map((idx) => (
                  <TableRow key={idx.name} style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
                    <TableCell className="px-3 py-1.5 font-medium">
                      <div className="flex items-center gap-1">
                        {idx.primary && <Hash className="size-3 text-muted-foreground" />}
                        {idx.name}
                      </div>
                    </TableCell>
                    <TableCell className="px-3 py-1.5 text-muted-foreground">{idx.columns.join(', ')}</TableCell>
                    <TableCell className="px-3 py-1.5">{idx.unique ? 'YES' : 'NO'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="stats" className="flex-1 overflow-auto">
          <TableStats connectionId={connectionId} tableId={tableId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
