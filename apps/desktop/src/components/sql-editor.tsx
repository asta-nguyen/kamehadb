import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useRunQuery } from '@/hooks/use-query';
import { api } from '@/lib/api';
import Editor, { type OnMount } from '@monaco-editor/react';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { DataTable, type ColumnDef } from '@/components/data-table';
import { RecordDetailTabs } from '@/components/table-view';
import { downloadResult } from '@/lib/export';
import { buildSqlCompletionEntries, type CompletionsData } from '@/lib/sql-autocomplete';
import { updateTabAutoRun, updateTabSql } from '@/store';
import type { QueryResult, WorkspaceTab } from '@kamehadb/shared';
import { AlertCircle, Clock, Download, FileJson, Loader2, Play } from 'lucide-react';

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
    <div className="p-4">
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
      </div>
    </div>
  );
}

export function SqlEditor({ tab, connectionId }: SqlEditorProps) {
  const [sql, setSql] = useState('sql' in tab ? (tab.sql ?? 'SELECT * FROM ') : 'SELECT * FROM ');
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedRow, setSelectedRow] = useState<Record<string, unknown> | null>(null);
  const resultKeyRef = useRef(0);
  const { data: completions } = useCompletionsSchema(connectionId);
  const completionsRef = useRef(completions);
  completionsRef.current = completions;

  const runQuery = useRunQuery(connectionId);

  const handleRun = useCallback(async () => {
    if (!sql.trim()) return;
    setError(null);
    setResult(null);

    try {
      const res = await runQuery.mutateAsync({ query: sql });
      resultKeyRef.current++;
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Query failed');
    }
  }, [sql, runQuery]);

  const handleChange = useCallback(
    (value: string | undefined) => {
      const v = value ?? '';
      setSql(v);
      updateTabSql(tab.id, v);
    },
    [tab.id],
  );

  const handleEditorDidMount: OnMount = useCallback(
    (editor, monaco) => {
      type M = typeof monaco;
      editor.focus();

      editor.addAction({
        id: 'run-query',
        label: 'Run Query',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
        run: () => handleRun(),
      });

      const provider = monaco.languages.registerCompletionItemProvider('sql', {
        triggerCharacters: ['.', ' ', '(', ',', '='],
        provideCompletionItems: (model: M['editor']['ITextModel'], position: M['Position']) => {
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

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0">
        <Button size="sm" onClick={handleRun} disabled={runQuery.isPending} className="gap-1.5">
          {runQuery.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
          Run
        </Button>
        <span className="text-xs text-muted-foreground">{runQuery.isPending ? 'Running...' : 'Ctrl+Enter to run'}</span>
      </div>

      <div className="flex-1 min-h-0 border-b border-border">
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

      <div className="flex-1 overflow-auto min-h-0">
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

        {result && <QueryResultTable key={resultKeyRef.current} result={result} onSelectRow={setSelectedRow} />}
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
