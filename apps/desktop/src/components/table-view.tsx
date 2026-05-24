import { useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import { useTableColumns, useTableIndexes, usePreviewRows } from "@/hooks/use-schema";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Key, Hash, Table2 } from "lucide-react";

type TableViewProps = {
  connectionId: string;
  tableId: string;
};

function DataGrid({ connectionId, tableId }: { connectionId: string; tableId: string }) {
  const { data: columns } = useTableColumns(connectionId, tableId);
  const { data: result, isLoading } = usePreviewRows(connectionId, {
    tableId,
    limit: 100,
  });

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
            <tr key={row.id} className="border-b last:border-b-0 hover:bg-muted/30">
              <td className="px-2 py-1 text-muted-foreground text-[11px]">{i + 1}</td>
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
          <span className="ml-auto">{result.durationMs}ms</span>
        </div>
      )}
    </div>
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

      <Tabs defaultValue="data" className="flex-1 flex flex-col">
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
