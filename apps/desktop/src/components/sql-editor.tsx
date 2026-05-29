import { useState, useCallback, useRef, useEffect } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useRunQuery } from '@/hooks/use-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

import { Play, Loader2, AlertCircle, Clock, Download } from 'lucide-react';
import { updateTabSql, updateTabAutoRun } from '@/store';
import { buildSqlCompletionEntries, type CompletionsData } from '@/lib/sql-autocomplete';
import { downloadResult } from '@/lib/export';
import type { QueryResult, WorkspaceTab } from '@kamehadb/shared';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

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

export function SqlEditor({ tab, connectionId }: SqlEditorProps) {
  const [sql, setSql] = useState('sql' in tab ? (tab.sql ?? 'SELECT * FROM ') : 'SELECT * FROM ');
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
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
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Query failed');
    }
  }, [sql, runQuery]);

  // Auto-run on mount if flag is set
  useEffect(() => {
    if ('autoRun' in tab && tab.autoRun && sql.trim()) {
      updateTabAutoRun(tab.id, false);
      void handleRun();
    }
  }, [tab, sql, handleRun]);
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
    clearTabAutoRun(tab.id);
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

        {result && (
          <div className="p-4">
            <div className="overflow-auto border rounded-md">
              {result.columns.length > 0 && (
                <div
                  className="grid text-xs bg-muted/50 sticky top-0 z-10"
                  style={{ gridTemplateColumns: `repeat(${result.columns.length}, minmax(120px, 1fr))` }}
                >
                  {result.columns.map((col) => (
                    <div
                      key={col.name}
                      className="px-3 py-1.5 font-medium text-muted-foreground border-r last:border-r-0 whitespace-nowrap"
                    >
                      {col.name}
                      <span className="ml-1 text-muted-foreground/60">{col.type}</span>
                    </div>
                  ))}
                </div>
              )}
              {result.rows.map((row, i) => (
                <div
                  key={i}
                  className="grid text-xs border-t border-border/40 hover:bg-muted/30"
                  style={{ gridTemplateColumns: `repeat(${result.columns.length}, minmax(120px, 1fr))` }}
                >
                  {result.columns.map((col) => (
                    <div
                      key={col.name}
                      className="px-3 py-1 border-r last:border-r-0 truncate"
                      title={row[col.name] === null ? '' : String(row[col.name])}
                    >
                      {row[col.name] === null ? (
                        <span className="text-muted-foreground italic">NULL</span>
                      ) : (
                        String(row[col.name])
                      )}
                    </div>
                  ))}
                </div>
              ))}
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
        )}
      </div>
    </div>
  );
}
