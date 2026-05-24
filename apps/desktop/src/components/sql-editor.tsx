import { useState, useCallback } from "react";
import Editor from "@monaco-editor/react";
import { useRunQuery } from "@/hooks/use-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, Loader2, AlertCircle, Clock } from "lucide-react";
import type { QueryResult } from "@kamehadb/shared";

type SqlEditorProps = {
  connectionId: string;
};

export function SqlEditor({ connectionId }: SqlEditorProps) {
  const [sql, setSql] = useState("SELECT * FROM ");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runQuery = useRunQuery(connectionId);

  const handleRun = useCallback(async () => {
    if (!sql.trim()) return;
    setError(null);
    setResult(null);

    try {
      const res = await runQuery.mutateAsync({ query: sql });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Query failed");
    }
  }, [sql, runQuery]);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0">
        <Button size="sm" onClick={handleRun} disabled={runQuery.isPending} className="gap-1.5">
          {runQuery.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Play className="size-3.5" />
          )}
          Run
        </Button>
        <span className="text-[11px] text-muted-foreground">
          {runQuery.isPending ? "Running..." : "Ctrl+Enter to run"}
        </span>
      </div>

      {/* Editor */}
      <div className="flex-1 min-h-0 border-b border-border">
        <Editor
          height="100%"
          defaultLanguage="sql"
          theme="vs-dark"
          value={sql}
          onChange={(v) => setSql(v ?? "")}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            automaticLayout: true,
            padding: { top: 8 },
          }}
        />
      </div>

      {/* Results */}
      <div className="flex-1 overflow-auto min-h-0">
        {runQuery.isPending && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 p-4 text-sm text-red-600">
            <AlertCircle className="size-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {result && (
          <div className="p-4">
            <div className="overflow-auto border rounded-md">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/50">
                    {result.columns.map((col) => (
                      <th
                        key={col.name}
                        className="px-3 py-1.5 text-left font-medium text-muted-foreground border-r last:border-r-0 whitespace-nowrap"
                      >
                        {col.name}
                        <span className="text-[10px] ml-1 text-muted-foreground/60">
                          {col.type}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, i) => (
                    <tr key={i} className="border-b last:border-b-0 hover:bg-muted/30">
                      {result.columns.map((col) => (
                        <td
                          key={col.name}
                          className="px-3 py-1 border-r last:border-r-0 truncate max-w-[250px]"
                        >
                          {row[col.name] === null ? (
                            <span className="text-muted-foreground italic">NULL</span>
                          ) : (
                            String(row[col.name])
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
              <span>{result.rowCount} rows returned</span>
              <span className="flex items-center gap-1">
                <Clock className="size-3" />
                {result.durationMs}ms
              </span>
              {result.truncated && <Badge variant="outline" className="text-[10px]">Truncated</Badge>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
