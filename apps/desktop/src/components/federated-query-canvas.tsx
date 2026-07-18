import { mergeQueryResults, type PerConnectionResult } from '@/lib/federated-merge';
import { updateTabFederatedConnections, updateTabSql } from '@/store';
import { useConnections } from '@/hooks/use-connections';
import { api } from '@/lib/api';
import { isSqlKind } from '@/lib/constants';
import { DataTable, type ColumnDef } from '@/components/data-table';
import { DbIcon } from '@/components/db-icon';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import type { WorkspaceTab } from '@/lib/types';
import type { QueryResult } from '@kamehadb/shared';
import { isQuerySafe } from '@kamehadb/shared';
import type { OnMount } from '@monaco-editor/react';
import { lazy, useCallback, useMemo, useRef, useState } from 'react';
import { AlertCircle, Clock, Play, Loader2 } from 'lucide-react';

const Editor = lazy(() => import('@monaco-editor/react'));

export function FederatedQueryCanvas({ tab }: { readonly tab: Extract<WorkspaceTab, { type: 'federated-query' }> }) {
  const [sql, setSql] = useState(tab.sql ?? 'SELECT * FROM ');
  const [selectedIds, setSelectedIds] = useState<readonly number[]>(tab.connectionIds);
  const [mergedResult, setMergedResult] = useState<QueryResult | null>(null);
  const [perConnectionErrors, setPerConnectionErrors] = useState<readonly PerConnectionResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [safetyError, setSafetyError] = useState<string | null>(null);
  const [splitRatio, setSplitRatio] = useState(0.5);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);

  const { data: connections } = useConnections();
  const sqlConnections = useMemo(() => (connections ?? []).filter((c) => isSqlKind(c.kind)), [connections]);

  const toggleConnection = useCallback(
    (id: number) => {
      setSelectedIds((prev) => {
        const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
        updateTabFederatedConnections(tab.id, next);
        return next;
      });
    },
    [tab.id],
  );

  const handleChange = useCallback(
    (value: string | undefined) => {
      const next = value ?? '';
      setSql(next);
      updateTabSql(tab.id, next);
    },
    [tab.id],
  );

  const handleRun = useCallback(async () => {
    if (!sql.trim() || selectedIds.length === 0) return;

    // Read-only safety gate — reject writes before dispatching anything (D-03).
    const { safe, reason } = isQuerySafe(sql);
    if (!safe) {
      setSafetyError(reason ?? 'Query is not allowed in read-only mode');
      setMergedResult(null);
      setPerConnectionErrors([]);
      return;
    }
    setSafetyError(null);
    setIsRunning(true);
    setMergedResult(null);
    setPerConnectionErrors([]);

    // Parallel dispatch — fire one POST /sql/:id/query per selected connection.
    // Each promise catches its own error so Promise.all never rejects (D-11).
    const connMap = new Map((connections ?? []).map((c) => [c.id, c]));
    const perConnection = await Promise.all(
      selectedIds.map(async (id): Promise<PerConnectionResult> => {
        const conn = connMap.get(id);
        try {
          const result = await api.request<QueryResult>('POST', `/sql/${id}/query`, { query: sql });
          return { connectionId: id, connectionName: conn?.name ?? String(id), result, error: null };
        } catch (err) {
          return {
            connectionId: id,
            connectionName: conn?.name ?? String(id),
            result: null,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }),
    );

    const merged = mergeQueryResults(perConnection);
    setMergedResult(merged.result);
    setPerConnectionErrors(perConnection.filter((p) => p.error !== null));
    setIsRunning(false);
  }, [sql, selectedIds, connections]);

  // Ref to avoid stale closure in Monaco keybinding (registered once on mount).
  // handleEditorMount runs only once, so addCommand would capture handleRun at
  // mount time; the ref always points at the latest handleRun (same pattern as
  // SqlEditor lines 776-777) so subsequent state changes are reflected when the
  // shortcut fires.
  const handleRunRef = useRef(handleRun);
  handleRunRef.current = handleRun;

  const handleEditorMount: OnMount = useCallback((editor) => {
    editorRef.current = editor;
    editor.addCommand(
      // Ctrl+Enter — monaco KeyCode doesn't reliably cross platforms for this,
      // so use the raw keybinding string. This matches SqlEditor's approach.
      2048 | 3, // KeyMod.CtrlCmd | KeyCode.Enter
      () => void handleRunRef.current(),
    );
  }, []);

  const handleSplitMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const container = (e.currentTarget as HTMLElement).parentElement!;
      const startY = e.clientY;
      const startRatio = splitRatio;
      const containerHeight = container.getBoundingClientRect().height - 6;

      const onMove = (me: MouseEvent) => {
        const dy = me.clientY - startY;
        const newRatio = Math.max(0.15, Math.min(0.85, startRatio + dy / containerHeight));
        setSplitRatio(newRatio);
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
    },
    [splitRatio],
  );

  const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(
    () =>
      (mergedResult?.columns ?? []).map((col) => ({
        id: col.name,
        header: col.name,
        accessor: (row) => row[col.name],
        render: (value) => {
          if (value === null || value === undefined) return <span className="text-muted-foreground italic">null</span>;
          return <span>{String(value)}</span>;
        },
      })),
    [mergedResult],
  );

  return (
    <div className="flex flex-col h-full">
      {/* Connection picker panel — toggle buttons for SQL-kind connections only (D-06/D-07) */}
      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border shrink-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <span className="text-xs text-muted-foreground shrink-0 mr-1">Connections:</span>
        {sqlConnections.length === 0 ? (
          <span className="text-xs text-muted-foreground">No SQL connections available</span>
        ) : (
          sqlConnections.map((conn) => {
            const selected = selectedIds.includes(conn.id);
            return (
              <Button
                key={conn.id}
                type="button"
                variant={selected ? 'default' : 'outline'}
                size="sm"
                className="h-6 gap-1.5 shrink-0"
                onClick={() => toggleConnection(conn.id)}
              >
                <DbIcon kind={conn.kind} className="size-3" />
                <span className="text-xs">{conn.name}</span>
              </Button>
            );
          })
        )}
      </div>

      {/* Run bar — Run button + status + safety error */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0">
        <Button
          size="sm"
          onClick={handleRun}
          disabled={isRunning || selectedIds.length === 0 || !sql.trim()}
          className="gap-1.5"
        >
          {isRunning ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
          Run
        </Button>
        <span className="text-xs text-muted-foreground">
          {isRunning ? 'Running...' : selectedIds.length === 0 ? 'Select connections to run' : 'Ctrl+Enter to run'}
        </span>
        {safetyError && (
          <Badge variant="destructive" className="gap-1">
            <AlertCircle className="size-3" />
            {safetyError}
          </Badge>
        )}
        <div className="flex-1" />
        {mergedResult && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="size-3" />
            {mergedResult.durationMs}ms
          </span>
        )}
      </div>

      {/* Split panel: Monaco editor (top) + merged DataTable (bottom) */}
      <div className="flex flex-1 min-h-0">
        <div className="flex flex-col flex-1 min-w-0">
          <div className="min-h-0 border-b border-border" style={{ flex: splitRatio }}>
            <Editor
              height="100%"
              defaultLanguage="sql"
              theme="vs-dark"
              value={sql}
              onChange={handleChange}
              onMount={handleEditorMount}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                padding: { top: 8 },
              }}
            />
          </div>

          {/* Draggable split handle — same pattern as SqlEditor */}
          <div
            onMouseDown={handleSplitMouseDown}
            className="shrink-0 h-1.5 cursor-row-resize bg-transparent hover:bg-muted/50 active:bg-primary/30 relative transition-colors"
          />

          <div className="overflow-auto" style={{ flex: 1 - splitRatio, minHeight: 0 }}>
            {isRunning && (
              <div className="flex items-center justify-center py-8">
                <Spinner size="lg" />
              </div>
            )}

            {/* Per-connection error notices — failed connections don't abort (D-11) */}
            {perConnectionErrors.length > 0 && (
              <div className="p-4 space-y-2">
                {perConnectionErrors.map((p) => (
                  <div key={p.connectionId} className="flex items-start gap-2 text-sm text-destructive">
                    <AlertCircle className="size-4 mt-0.5 shrink-0" />
                    <span>
                      <strong>{p.connectionName}</strong>: {p.error}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Merged result grid */}
            {mergedResult && mergedResult.rows.length > 0 && (
              <div className="p-4">
                <DataTable
                  rows={mergedResult.rows}
                  columns={columns}
                  rowKey={(_, i) => String(i)}
                  showIndex
                  stickyHeader
                />
                <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                  <span>{mergedResult.rowCount} rows</span>
                  {mergedResult.truncated && <span className="text-amber-500">(truncated)</span>}
                </div>
              </div>
            )}

            {/* Empty state — ran successfully but no rows */}
            {mergedResult && mergedResult.rows.length === 0 && perConnectionErrors.length === 0 && !isRunning && (
              <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                No rows returned
              </div>
            )}

            {/* Initial state — never run */}
            {!mergedResult && !isRunning && perConnectionErrors.length === 0 && !safetyError && (
              <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                Enter a read-only SQL query and click Run
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
