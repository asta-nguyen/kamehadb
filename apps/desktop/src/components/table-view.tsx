import { useState, useMemo, useCallback } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import { useTableColumns, useTableIndexes, usePreviewRows } from "@/hooks/use-schema";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Key, Hash, Table2, ChevronLeft, ChevronRight, FileJson, Copy, Check } from "lucide-react";

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
        <table className="w-full text-xs">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b bg-muted/50">
                <th className="w-8 px-2 py-1 text-left text-muted-foreground font-medium">#</th>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-3 py-1 text-left font-medium text-muted-foreground border-r last:border-r-0 whitespace-nowrap"
                    style={{ width: header.getSize() }}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row, i) => (
              <tr
                key={row.id}
                className="border-b last:border-b-0 hover:bg-muted/30 cursor-pointer"
                onClick={() => setSelectedRow(row.original)}
              >
                <td className="px-2 py-1 text-muted-foreground text-[11px]">{offset + i + 1}</td>
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className="px-3 py-1 border-r last:border-r-0 truncate max-w-[250px]"
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {result && (
          <div className="px-3 py-1.5 text-[11px] text-muted-foreground border-t bg-muted/30 flex items-center gap-3">
            <span>{result.rowCount} rows</span>
            {result.truncated && <Badge variant="outline" className="text-[10px]">Truncated</Badge>}
            <span className="ml-auto mr-auto">{result.durationMs}ms</span>
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
          </div>
        )}
      </div>

      <Sheet open={!!selectedRow} onOpenChange={(open) => { if (!open) setSelectedRow(null); }}>
        <SheetContent className="sm:max-w-lg flex flex-col">
          <SheetHeader className="shrink-0">
            <SheetTitle className="flex items-center gap-2">
              <FileJson className="size-4" />
              Record #{selectedRow ? offset + result?.rows.indexOf(selectedRow)! + 1 : ""}
            </SheetTitle>
          </SheetHeader>
          <RecordDetailTabs selectedRow={selectedRow} />
        </SheetContent>
      </Sheet>
    </>
  );
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
          <TabsTrigger value="view" className="text-xs">View</TabsTrigger>
          <TabsTrigger value="json" className="text-xs">JSON</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="view" className="flex-1 min-h-0 p-0">
        <ScrollArea className="h-full">
          <div className="px-4 pb-4 space-y-0">
            {Object.entries(selectedRow).map(([key, value]) => (
              <div key={key} className="border-b border-border last:border-b-0 py-2">
                <div className="text-[11px] font-medium text-muted-foreground mb-0.5">{key}</div>
                <div className="text-sm font-mono break-all">
                  {value === null ? (
                    <span className="text-muted-foreground italic">null</span>
                  ) : typeof value === "object" ? (
                    <pre className="text-[11px] whitespace-pre-wrap bg-muted/50 rounded p-2 mt-1">
                      {JSON.stringify(value, null, 2)}
                    </pre>
                  ) : (
                    String(value)
                  )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </TabsContent>

      <TabsContent value="json" className="flex-1 min-h-0 p-0">
        <div className="relative h-full">
          <Button
            variant="outline"
            size="icon-sm"
            className="absolute top-2 right-2 z-10"
            onClick={handleCopy}
          >
            {copied ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
          </Button>
          <ScrollArea className="h-full">
            <pre className="text-[11px] font-mono p-4 whitespace-pre-wrap">
              {JSON.stringify(selectedRow, null, 2)}
            </pre>
          </ScrollArea>
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
            <TabsTrigger value="data" className="text-xs">Data</TabsTrigger>
            <TabsTrigger value="columns" className="text-xs">Columns</TabsTrigger>
            <TabsTrigger value="indexes" className="text-xs">Indexes</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="data" className="flex-1 p-4 pt-2 overflow-auto">
          <DataGrid connectionId={connectionId} tableId={tableId} />
        </TabsContent>

        <TabsContent value="columns" className="flex-1 p-4 pt-2 overflow-auto">
          <div className="border rounded-md">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-3 py-1.5 text-left font-medium">Name</th>
                  <th className="px-3 py-1.5 text-left font-medium">Type</th>
                  <th className="px-3 py-1.5 text-left font-medium">Nullable</th>
                  <th className="px-3 py-1.5 text-left font-medium">Default</th>
                  <th className="px-3 py-1.5 text-left font-medium">Key</th>
                </tr>
              </thead>
              <tbody>
                {columns?.map((col) => (
                  <tr key={col.name} className="border-b last:border-b-0 hover:bg-muted/30">
                    <td className="px-3 py-1.5 font-medium">{col.name}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{col.type}</td>
                    <td className="px-3 py-1.5">{col.nullable ? "YES" : "NO"}</td>
                    <td className="px-3 py-1.5 text-muted-foreground font-mono text-[11px]">
                      {col.default ?? <span className="italic">null</span>}
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-1">
                        {col.primaryKey && <Key className="size-3 text-amber-500" />}
                        {col.foreignKey && (
                          <span className="text-[10px] text-muted-foreground">
                            &rarr; {col.foreignKey.table}({col.foreignKey.column})
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="indexes" className="flex-1 p-4 pt-2 overflow-auto">
          <div className="border rounded-md">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-3 py-1.5 text-left font-medium">Name</th>
                  <th className="px-3 py-1.5 text-left font-medium">Columns</th>
                  <th className="px-3 py-1.5 text-left font-medium">Unique</th>
                </tr>
              </thead>
              <tbody>
                {indexes?.map((idx) => (
                  <tr key={idx.name} className="border-b last:border-b-0 hover:bg-muted/30">
                    <td className="px-3 py-1.5 font-medium">
                      <div className="flex items-center gap-1">
                        {idx.primary && <Hash className="size-3 text-amber-500" />}
                        {idx.name}
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground">
                      {idx.columns.join(", ")}
                    </td>
                    <td className="px-3 py-1.5">{idx.unique ? "YES" : "NO"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
