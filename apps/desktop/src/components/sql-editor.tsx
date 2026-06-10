import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useRunQuery } from '@/hooks/use-query';
import { useSaveQueryHistory } from '@/hooks/use-query-history';
import { QueryHistoryPanel } from '@/components/query-history-panel';
import { api } from '@/lib/api';
import type { OnMount } from '@monaco-editor/react';
import { useQuery } from '@tanstack/react-query';
import { toPng } from 'html-to-image';
import { lazy, useCallback, useEffect, useRef, useState } from 'react';
const Editor = lazy(() => import('@monaco-editor/react'));

import { DataTable, type ColumnDef } from '@/components/data-table';
import { RecordDetailTabs } from '@/components/table-view';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { downloadResult } from '@/lib/export';
import { buildSqlCompletionEntries, type CompletionsData } from '@/lib/sql-autocomplete';
import { updateTabAutoRun, updateTabSql } from '@/store';
import type { QueryResult, WorkspaceTab } from '@kamehadb/shared';
import { AlertCircle, BarChart3, Clock, Download, FileJson, History, Image, Loader2, Play, Table2 } from 'lucide-react';
import { ChartView } from '@/components/chart-view';

function useCompletionsSchema(connectionId: string | null) {
  return useQuery({
    queryKey: ['completions', connectionId],
    queryFn: () => api.request<CompletionsData>('GET', `/sql/${connectionId}/completions`),
    enabled: !!connectionId,
    staleTime: 5 * 60 * 1000,
  });
}

type SqlEditorProps = {
  tab: WorkspaceTab;
  connectionId: string;
};

function QueryResultTable({
  result,
  onSelectRow,
}: {
  result: QueryResult;
  onSelectRow: (row: Record<string, unknown>) => void;
}) {
  const tableRef = useRef<HTMLDivElement>(null);

  const columns: ColumnDef<Record<string, unknown>>[] = result.columns.map((col) => ({
    id: col.name,
    header: (
      <span className="flex items-center gap-1">
        <span>{col.name}</span>
        <span className="text-muted-foreground/60 font-normal">{col.type}</span>
      </span>
    ),
    accessor: (row) => row[col.name],
    headerClassName: 'px-3 text-left whitespace-nowrap',
    cellClassName: 'px-3',
  }));

  return (
    <div ref={tableRef} className="p-4">
      <div className="overflow-auto border rounded-md">
        <DataTable
          rows={result.rows}
          columns={columns}
          rowKey={(_, i) => String(i)}
          showIndex
          onRowClick={(row) => onSelectRow(row)}
        />
      </div>
      <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          <span>{result.rowCount} rows returned</span>
          <span className="flex items-center gap-1">
            <Clock className="size-3" />
            {result.durationMs}ms
          </span>
          {result.truncated && (
            <Badge variant="outline" className="text-xs">
              Truncated
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-xs font-medium whitespace-nowrap transition-all outline-none select-none h-7 gap-1 hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50 px-2.5 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5">
              <Download className="size-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => downloadResult(result, 'csv')}>Export as CSV</DropdownMenuItem>
              <DropdownMenuItem onClick={() => downloadResult(result, 'json')}>Export as JSON</DropdownMenuItem>
              <DropdownMenuItem onClick={() => downloadResult(result, 'sql')}>Export as SQL</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={async () => {
              if (!tableRef.current) return;
              const dataUrl = await toPng(tableRef.current, { backgroundColor: '#ffffff' });
              const res = await fetch(dataUrl);
              const blob = await res.blob();
              await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
            }}
            title="Copy result snapshot"
          >
            <Image className="size-3" />
            Snapshot
          </Button>
        </div>
      </div>
    </div>
  );
}

export function SqlEditor({ tab, connectionId }: SqlEditorProps) {
  const [sql, setSql] = useState('sql' in tab ? (tab.sql ?? 'SELECT * FROM ') : 'SELECT * FROM ');
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedRow, setSelectedRow] = useState<Record<string, unknown> | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showChart, setShowChart] = useState(false);
  const [splitRatio, setSplitRatio] = useState(0.5);
  const resultKeyRef = useRef(0);
  const { data: completions } = useCompletionsSchema(connectionId);
  const completionsRef = useRef(completions);
  completionsRef.current = completions;

  const runQuery = useRunQuery(connectionId);
  const saveHistory = useSaveQueryHistory(connectionId);

  const handleRun = useCallback(async () => {
    if (!sql.trim()) return;
    setError(null);
    setResult(null);

    try {
      const res = await runQuery.mutateAsync({ query: sql });
      resultKeyRef.current++;
      setResult(res);
      saveHistory.mutate({ query: sql, durationMs: res.durationMs, rowCount: res.rowCount });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Query failed');
    }
  }, [sql, runQuery, saveHistory]);

  // Ref to avoid stale closure in Monaco keybinding (registered once on mount)
  const handleRunRef = useRef(handleRun);
  handleRunRef.current = handleRun;

  const handleChange = useCallback(
    (value: string | undefined) => {
      const v = value ?? '';
      setSql(v);
      updateTabSql(tab.id, v);
    },
    [tab.id],
  );

  const handleSelectFromHistory = useCallback(
    (query: string) => {
      setSql(query);
      updateTabSql(tab.id, query);
    },
    [tab.id],
  );

  const handleEditorDidMount: OnMount = useCallback(
    (editor, monaco) => {
      editor.focus();

      editor.addAction({
        id: 'run-query',
        label: 'Run Query',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
        run: () => handleRunRef.current(),
      }); // eslint-disable-line react-hooks/exhaustive-deps

      const provider = monaco.languages.registerCompletionItemProvider('sql', {
        triggerCharacters: ['.', ' ', '(', ',', '='],
        provideCompletionItems: (model, position) => {
          const data = completionsRef.current;
          if (!data) return { suggestions: [] };

          const word = model.getWordUntilPosition(position);
          const fullSql = model.getValue();
          const textUntil = model.getValueInRange({
            startLineNumber: position.lineNumber,
            startColumn: 1,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          });

          const suggestions = buildSqlCompletionEntries(fullSql, textUntil, data).map((item) => ({
            label: item.label,
            kind:
              item.kind === 'table'
                ? monaco.languages.CompletionItemKind.Struct
                : item.kind === 'column'
                  ? monaco.languages.CompletionItemKind.Field
                  : item.kind === 'function'
                    ? monaco.languages.CompletionItemKind.Function
                    : item.kind === 'operator'
                      ? monaco.languages.CompletionItemKind.Operator
                      : monaco.languages.CompletionItemKind.Keyword,
            insertText: item.insertText,
            detail: item.detail,
            sortText: item.sortText,
            range: {
              startLineNumber: position.lineNumber,
              endLineNumber: position.lineNumber,
              startColumn: word.startColumn,
              endColumn: position.column,
            },
          }));

          return { suggestions };
        },
      });

      editor.onDidDispose(() => provider.dispose());
    },
    [handleRun],
  );

  useEffect(() => {
    if (!('autoRun' in tab) || !tab.autoRun) return;
    updateTabAutoRun(tab.id, false);
    void handleRun();
  }, [tab, handleRun]);

  // Draggable split handle between editor and results
  const handleSplitMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const container = (e.currentTarget as HTMLElement).parentElement!;
      const startY = e.clientY;
      const startRatio = splitRatio;
      const containerHeight = container.getBoundingClientRect().height - 6; // 6px = handle height

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

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0">
        <Button size="sm" onClick={handleRun} disabled={runQuery.isPending} className="gap-1.5">
          {runQuery.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
          Run
        </Button>
        <span className="text-xs text-muted-foreground">{runQuery.isPending ? 'Running...' : 'Ctrl+Enter to run'}</span>
        <div className="flex-1" />
        {result && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowChart(!showChart)}
            className={showChart ? 'bg-muted' : ''}
          >
            {showChart ? <Table2 className="size-3.5" /> : <BarChart3 className="size-3.5" />}
            {showChart ? 'Table' : 'Chart'}
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowHistory(!showHistory)}
          className={showHistory ? 'bg-muted' : ''}
        >
          <History className="size-3.5" />
          History
        </Button>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="flex flex-col flex-1 min-w-0">
          <div className="min-h-0 border-b border-border" style={{ flex: splitRatio }}>
            <Editor
              height="100%"
              defaultLanguage="sql"
              theme="vs-dark"
              value={sql}
              onChange={handleChange}
              onMount={handleEditorDidMount}
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

          {/* Draggable split handle */}
          <div
            onMouseDown={handleSplitMouseDown}
            className="shrink-0 h-1.5 cursor-row-resize bg-transparent hover:bg-muted/50 active:bg-primary/30 relative transition-colors"
          />

          <div className="overflow-auto" style={{ flex: 1 - splitRatio, minHeight: 0 }}>
            {runQuery.isPending && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 p-4 text-sm text-destructive">
                <AlertCircle className="size-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {result &&
              (showChart ? (
                <ChartView key={`chart-${resultKeyRef.current}`} result={result} />
              ) : (
                <QueryResultTable key={resultKeyRef.current} result={result} onSelectRow={setSelectedRow} />
              ))}
          </div>
        </div>

        {showHistory && (
          <QueryHistoryPanel
            connectionId={connectionId}
            onSelectQuery={handleSelectFromHistory}
            onClose={() => setShowHistory(false)}
          />
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
              Record details
            </SheetTitle>
          </SheetHeader>
          <RecordDetailTabs selectedRow={selectedRow} />
        </SheetContent>
      </Sheet>
    </div>
  );
}
