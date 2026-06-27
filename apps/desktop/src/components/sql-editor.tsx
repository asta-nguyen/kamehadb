import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { appendFrontendLog } from '@/lib/app-logs';
import { useRunQuery } from '@/hooks/use-query';
import { useSaveQueryHistory } from '@/hooks/use-query-history';
import { useTableColumns } from '@/hooks/use-schema';
import { QueryHistoryPanel } from '@/components/query-history-panel';
import { TableEditabilityNotice } from '@/components/table-editability-notice';
import { api } from '@/lib/api';
import { buildRowUpdateQuery, getQueryResultEditabilityState, inferSimpleSelectTableId } from '@/lib/table-editability';
import type { OnMount } from '@monaco-editor/react';
import type { editor as monacoEditor } from 'monaco-editor';
import { useQuery } from '@tanstack/react-query';
import { lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
const Editor = lazy(() => import('@monaco-editor/react'));

// SQL keywords that can begin a new statement. Used to detect blank-line-separated
// multi-statement SQL (e.g. "SELECT 1\n\nSELECT 2") where no semicolons exist.
const STATEMENT_STARTS = new Set([
  'SELECT',
  'WITH',
  'VALUES',
  'TABLE',
  'INSERT',
  'UPDATE',
  'DELETE',
  'MERGE',
  'CREATE',
  'ALTER',
  'DROP',
  'TRUNCATE',
  'RENAME',
  'COMMENT',
  'CALL',
  'DO',
  'GRANT',
  'REVOKE',
  'BEGIN',
  'COMMIT',
  'ROLLBACK',
  'SAVEPOINT',
  'EXPLAIN',
  'SHOW',
  'DESCRIBE',
  'COPY',
  'PREPARE',
  'EXECUTE',
  'DEALLOCATE',
  'VACUUM',
  'ANALYZE',
  'REINDEX',
  'LISTEN',
  'NOTIFY',
  'UNLISTEN',
  'DECLARE',
  'OPEN',
  'FETCH',
  'CLOSE',
  'MOVE',
  'DISCARD',
  'LOAD',
  'SET',
]);

/** Split SQL into individual statements by semicolons, respecting string
 *  literals, dollar-quoting, identifiers, and comments so semicolons inside
 *  those constructs don't trigger false splits. Also supports blank-line-
 *  separated keyword groups (no semicolons needed).
 *
 *  Handles:
 *    - "SELECT 1; SELECT 2"                  (semicolons)
 *    - "SELECT ';' FROM t"                   (string literal — no split)
 *    - "SELECT $$a;b$$"                      (dollar-quoting — no split)
 *    - "SELECT * -- comment; more comment"   (line comment — no split)
 *    - "SELECT 1\n\n\nSELECT 2"              (blank lines, no semicolons)
 *    - Mixed: "SELECT 1;\n\nSELECT 2"
 */
function splitSqlStatements(sql: string): string[] {
  const trimmed = sql.trim();
  if (!trimmed) return [];

  // Single-pass split that tracks quoting / comment context.
  const parts: string[] = [];
  let current = '';
  let i = 0;
  outer: while (i < trimmed.length) {
    const ch = trimmed[i];

    // Line comment --  (also --)
    if (ch === '-' && trimmed[i + 1] === '-') {
      current += '--';
      i += 2;
      while (i < trimmed.length && trimmed[i] !== '\n') {
        current += trimmed[i];
        i++;
      }
      continue;
    }

    // Block comment /* */
    if (ch === '/' && trimmed[i + 1] === '*') {
      current += '/*';
      i += 2;
      while (i < trimmed.length) {
        current += trimmed[i];
        if (trimmed[i] === '*' && trimmed[i + 1] === '/') {
          current += '/';
          i += 2;
          continue outer;
        }
        i++;
      }
      continue;
    }

    // Single-quoted string '...' ('' escapes)
    if (ch === "'") {
      current += "'";
      i++;
      while (i < trimmed.length) {
        current += trimmed[i];
        if (trimmed[i] === "'") {
          if (trimmed[i + 1] === "'") {
            // Escaped quote ''
            current += "'";
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    // Double-quoted identifier "..." ("" escapes)
    if (ch === '"') {
      current += '"';
      i++;
      while (i < trimmed.length) {
        current += trimmed[i];
        if (trimmed[i] === '"') {
          if (trimmed[i + 1] === '"') {
            current += '"';
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    // Dollar-quoting $$ or $tag$
    if (ch === '$') {
      // Peek ahead for the closing tag
      const start = i;
      i++;
      while (i < trimmed.length && trimmed[i] !== '$') i++;
      if (i < trimmed.length && trimmed[i] === '$') {
        const tag = trimmed.slice(start, i + 1); // e.g. $$ or $func$
        current += tag;
        i++;
        // Scan for the closing tag
        while (i <= trimmed.length - tag.length) {
          current += trimmed[i];
          if (trimmed.slice(i, i + tag.length) === tag) {
            current += tag.slice(1); // the tag minus first $
            i += tag.length;
            break;
          }
          current += trimmed[i];
          i++;
        }
        continue;
      }
      // Lone $ — not a dollar-quote, just emit as-is
      current += '$';
      i++;
      continue;
    }

    // Semicolon — split point (we are outside any string/comment/identifier)
    if (ch === ';') {
      const trimmedPart = current.trim();
      if (trimmedPart.length > 0) parts.push(trimmedPart);
      current = '';
      i++;
      continue;
    }

    current += ch;
    i++;
  }

  // Last part
  const finalPart = current.trim();
  if (finalPart.length > 0) parts.push(finalPart);

  if (parts.length === 0) return [];

  // Step 2: for each semicolon-delimited part, check for blank-line-separated
  // keyword groups and split those too.
  const result: string[] = [];
  for (const part of parts) {
    const groups = splitBlankLineGroups(part);
    result.push(...groups);
  }
  return result;
}

/** Group lines by blank-line separators. Only returns multiple groups (i.e. splits)
 *  when every group starts with a SQL statement keyword, to avoid breaking
 *  statements that happen to contain blank lines (e.g. SELECT with a blank before WHERE). */
function splitBlankLineGroups(sql: string): string[] {
  const lines = sql.split('\n');
  const groups: string[][] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (line.trim().length === 0) {
      if (current.length > 0) {
        groups.push(current);
        current = [];
      }
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) groups.push(current);

  if (groups.length <= 1) return groups.length === 1 ? [groups[0].join('\n')] : [sql];

  // Only split when EVERY group starts with a SQL keyword — avoids false positives
  // on blank lines within a single statement.
  const allStartWithKeyword = groups.every((g) => {
    const firstWord = g[0].trimStart().split(/\s+/)[0].toUpperCase();
    return STATEMENT_STARTS.has(firstWord);
  });

  if (allStartWithKeyword) {
    return groups.map((g) => g.join('\n'));
  }
  return [sql];
}

/** Returns true when sql contains 2+ statements (by semicolons or blank-line keyword groups). */
function containsMultipleStatements(sql: string): boolean {
  const trimmed = sql.trim();
  if (!trimmed) return false;

  // Check semicolons between non-empty parts
  const semiParts = trimmed
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (semiParts.length > 1) return true;

  // Check blank-line-separated SQL keyword groups
  return splitBlankLineGroups(trimmed).length > 1;
}

import { DataTable, type ColumnDef } from '@/components/data-table';
import { RecordDetailTabs } from '@/components/record-detail-tabs';
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
import type { WorkspaceTab } from '@/lib/types';
import type { QueryResult } from '@kamehadb/shared';
import { safeErrorMessage } from '@kamehadb/shared';
import { Spinner } from '@/components/ui/spinner';
import {
  AlertCircle,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Download,
  Ellipsis,
  Eye,
  FileJson,
  History,
  Loader2,
  Play,
  Table2,
} from 'lucide-react';
import { QUERY_KEYS } from '@/lib/query-keys';
import { ChartView } from '@/components/chart-view';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

function useCompletionsSchema(connectionId: string | null) {
  return useQuery({
    queryKey: QUERY_KEYS.COMPLETIONS(connectionId),
    queryFn: () => api.request<CompletionsData>('GET', `/sql/${connectionId}/autocomplete`),
    enabled: !!connectionId,
    staleTime: 5 * 60 * 1000,
  });
}

type SqlEditorProps = {
  tab: WorkspaceTab;
  connectionId: string;
};

function QueryResultTable({
  connectionId,
  executedSql,
  result,
  onSelectRow,
  onRefresh,
  queryLimit,
  offset,
  onPrevPage,
  onNextPage,
  onLimitChange,
}: {
  connectionId: string;
  executedSql: string;
  result: QueryResult;
  onSelectRow: (row: Record<string, unknown>) => void;
  onRefresh: () => void;
  queryLimit: number;
  offset: number;
  onPrevPage: () => void;
  onNextPage: () => void;
  onLimitChange: (newLimit: number) => void;
}) {
  const tableRef = useRef<HTMLDivElement>(null);
  const runQuery = useRunQuery(connectionId);
  const [editingCell, setEditingCell] = useState<{ rowIndex: number; column: string } | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const editableTableId = useMemo(() => inferSimpleSelectTableId(executedSql), [executedSql]);
  const { data: tableColumns } = useTableColumns(connectionId, editableTableId);
  const editability = getQueryResultEditabilityState({
    querySql: executedSql,
    resultColumns: result.columns,
    tableColumns,
    isReadOnly: false,
  });
  const pkColumns = useMemo(
    () =>
      tableColumns && tableColumns.length > 0
        ? tableColumns.filter((column) => column.primaryKey).map((column) => column.name)
        : [],
    [tableColumns],
  );
  const dateColumns = useMemo(
    () =>
      new Set(
        (tableColumns ?? [])
          .filter((column) => {
            const type = column.type.toLowerCase();
            return (
              type === 'date' ||
              type === 'timestamp' ||
              type === 'timestamptz' ||
              type === 'datetime' ||
              type.startsWith('timestamp')
            );
          })
          .map((column) => column.name),
      ),
    [tableColumns],
  );

  const saveCellEdit = useCallback(
    (rowIndex: number, column: string, newValue: string, columnType?: string) => {
      setEditingCell(null);
      if (!editability.canEditCells || !editability.tableId) return;
      const row = result.rows[rowIndex];
      if (!row) return;
      const oldValue = row[column];
      if (String(oldValue ?? '') === newValue) return;

      const sql = buildRowUpdateQuery({
        tableId: editability.tableId,
        row,
        column,
        newValue,
        columnType,
        pkColumns,
        allColumnNames: result.columns.map((resultColumn) => resultColumn.name),
        dateColumns,
      });

      runQuery.mutate(
        { query: sql },
        {
          onSuccess: () => {
            onRefresh();
          },
          onError: (error) => {
            console.error('Failed to update query result row:', error);
            onRefresh();
          },
        },
      );
    },
    [dateColumns, editability, onRefresh, pkColumns, result.columns, result.rows, runQuery],
  );

  const columns: ColumnDef<Record<string, unknown>>[] = result.columns.map((col) => ({
    id: col.name,
    header: (
      <span className="flex items-center gap-1">
        <span>{col.name}</span>
        <span className="text-muted-foreground/60 font-normal">{col.type}</span>
      </span>
    ),
    accessor: (row) => row[col.name],
    render: (value, _row, rowIndex) => {
      const isEditing = editingCell?.rowIndex === rowIndex && editingCell?.column === col.name;
      const isDate = dateColumns.has(col.name);
      if (isEditing) {
        const inputType =
          isDate && typeof value === 'string'
            ? col.type.toLowerCase() === 'date'
              ? 'date'
              : 'datetime-local'
            : 'text';
        const formatDefault = (inputValue: unknown): string => {
          if (inputValue === null || inputValue === undefined) return '';
          const stringValue = String(inputValue);
          if (isDate && stringValue.includes('T')) {
            if (inputType === 'date') return stringValue.slice(0, 10);
            return stringValue.slice(0, 16);
          }
          return stringValue;
        };

        return (
          <Input
            ref={editInputRef}
            type={inputType}
            defaultValue={formatDefault(value)}
            autoFocus
            className="h-7 min-w-0 text-xs"
            onClick={(event) => event.stopPropagation()}
            onBlur={(event) => setTimeout(() => saveCellEdit(rowIndex, col.name, event.target.value, col.type), 150)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.currentTarget.blur();
              } else if (event.key === 'Escape') {
                setEditingCell(null);
              }
            }}
          />
        );
      }

      return (
        <span
          onDoubleClick={editability.canEditCells ? () => setEditingCell({ rowIndex, column: col.name }) : undefined}
          className={editability.canEditCells ? 'block w-full cursor-pointer' : 'block w-full'}
        >
          {value === null ? (
            <span className="text-muted-foreground italic">null</span>
          ) : value === undefined ? (
            <span className="text-muted-foreground">-</span>
          ) : typeof value === 'object' ? (
            <span className="text-primary">{JSON.stringify(value)}</span>
          ) : (
            <span>{String(value)}</span>
          )}
        </span>
      );
    },
  }));

  return (
    <div ref={tableRef} className="flex flex-col h-full min-h-0 p-4">
      {editability.warningMessage && editability.warningTone && (
        <TableEditabilityNotice message={editability.warningMessage} tone={editability.warningTone} />
      )}
      <div className="min-h-0 overflow-hidden border border-border rounded-md">
        <div className="overflow-auto max-h-full">
          <DataTable
            rows={result.rows}
            columns={columns}
            rowKey={(_, i) => String(i)}
            showIndex
            stickyHeader
            onRowClick={editability.canEditCells ? undefined : (row) => onSelectRow(row)}
            suffixHeader="Actions"
            suffixWidth="64px"
            suffix={(row) => (
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
                  <Ellipsis className="size-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem onClick={() => onSelectRow(row)}>
                    <Eye className="size-3.5 mr-2" />
                    View details
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigator.clipboard.writeText(JSON.stringify(row, null, 2))}>
                    <Copy className="size-3.5 mr-2" />
                    Copy row
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          />
        </div>
      </div>
      <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          <span>{result.rowCount} rows returned</span>
          {offset > 0 && <span className="text-muted-foreground/60">(offset {offset})</span>}
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
          <div className="flex items-center gap-0.5 mr-1">
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={offset === 0} onClick={onPrevPage}>
              <ChevronLeft className="size-3.5" />
              Prev
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={queryLimit === 0 || result.rowCount < queryLimit}
              onClick={onNextPage}
            >
              Next
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
          <div className="w-px h-4 bg-border mx-1" />
          <Select value={String(queryLimit)} onValueChange={(v) => onLimitChange(Number(v))}>
            <SelectTrigger className="h-7 text-xs w-22 gap-1" title="Row limit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="50">50 rows</SelectItem>
              <SelectItem value="100">100 rows</SelectItem>
              <SelectItem value="500">500 rows</SelectItem>
              <SelectItem value="1000">1000 rows</SelectItem>
              <SelectItem value="0">No limit</SelectItem>
            </SelectContent>
          </Select>
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
    </div>
  );
}

export function SqlEditor({ tab, connectionId }: SqlEditorProps) {
  const [sql, setSql] = useState('sql' in tab ? (tab.sql ?? 'SELECT * FROM ') : 'SELECT * FROM ');
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<QueryResult[]>([]);
  const [executedStatements, setExecutedStatements] = useState<string[]>([]);
  const [activeResultIndex, setActiveResultIndex] = useState(0);
  const [isExecutingBatch, setIsExecutingBatch] = useState(false);
  const [selectedRow, setSelectedRow] = useState<Record<string, unknown> | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showChart, setShowChart] = useState(false);
  const [splitRatio, setSplitRatio] = useState(0.5);
  const [queryLimit, setQueryLimit] = useState(100);
  const [offset, setOffset] = useState(0);
  const resultKeyRef = useRef(0);

  // The SQL as last-executed, without any auto-appended LIMIT/OFFSET clause,
  // so we can paginate by varying the offset while keeping the query intact.
  const baseSqlRef = useRef(sql);

  // Monaco editor ref for selection-aware execution and error markers
  const editorRef = useRef<monacoEditor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null);

  const { data: completions } = useCompletionsSchema(connectionId);
  const completionsRef = useRef(completions);
  completionsRef.current = completions;

  const runQuery = useRunQuery(connectionId);
  const saveHistory = useSaveQueryHistory(connectionId);

  // Only append LIMIT for queries that support it (SELECT / WITH / VALUES / TABLE).
  // Otherwise many engines error with "syntax error at or near 'LIMIT'".
  function queryWithLimit(sql: string, limit: number, offsetVal?: number): string {
    if (limit <= 0) return sql;
    // Multi-statement SQL: each statement is executed individually after
    // splitting. A global LIMIT at the end would become a standalone statement
    // after the split, causing a syntax error on every engine.
    if (containsMultipleStatements(sql)) return sql;
    const upper = sql.trimStart().toUpperCase();
    const supportsLimit =
      upper.startsWith('SELECT') || upper.startsWith('WITH') || upper.startsWith('VALUES') || upper.startsWith('TABLE');
    if (!supportsLimit) return sql;
    // Don't double-append if the query already has a LIMIT clause
    if (/\bLIMIT\b/i.test(sql)) return sql;
    const trimmed = sql.trimEnd().replace(/;+$/, '');
    return offsetVal !== undefined ? `${trimmed} LIMIT ${limit} OFFSET ${offsetVal}` : `${trimmed} LIMIT ${limit}`;
  }

  // Build the full SQL with LIMIT / OFFSET and execute it.
  // When the SQL contains multiple statements (separated by semicolons or
  // blank-line keyword groups), each is executed individually and all results
  // are shown in tabs. LIMIT is applied per individual statement so it never
  // becomes a standalone "LIMIT N" query after splitting.
  const executeQuery = useCallback(
    async (querySql: string) => {
      if (!querySql.trim()) return;
      setError(null);
      setResult(null);
      setResults([]);
      setExecutedStatements([]);
      setActiveResultIndex(0);
      setIsExecutingBatch(true);
      // Clear previous error markers before a new execution
      const model = editorRef.current?.getModel();
      const monaco = monacoRef.current;
      if (model && monaco) {
        monaco.editor.setModelMarkers(model, 'sql-error', []);
      }

      const statements = splitSqlStatements(querySql);
      if (statements.length === 0) {
        setIsExecutingBatch(false);
        return;
      }

      try {
        const allResults: QueryResult[] = [];
        for (let i = 0; i < statements.length; i++) {
          // Apply LIMIT per individual statement so multi-statement SQL never
          // produces a standalone "LIMIT N" after the split.
          const stmt = queryWithLimit(statements[i], queryLimit);
          const res = await runQuery.mutateAsync({ query: stmt });
          saveHistory.mutate({ query: stmt, durationMs: res.durationMs, rowCount: res.rowCount });
          allResults.push(res);
        }
        resultKeyRef.current++;
        if (allResults.length === 1) {
          setResult(allResults[0]);
          setExecutedStatements([statements[0]]);
        } else {
          setResults(allResults);
          setExecutedStatements(statements);
          setActiveResultIndex(0);
        }
      } catch (err) {
        const message = safeErrorMessage(err, 'Query failed');
        setError(message);
        void appendFrontendLog({
          level: 'error',
          scope: 'sql-editor.query',
          message: `Query execution failed: ${message}`,
          details: err instanceof Error ? err.stack : String(err),
        });
        // Parse the error message for line number and add marker in Monaco
        const editor = editorRef.current;
        const m = monacoRef.current;
        if (editor && m) {
          const errModel = editor.getModel();
          if (errModel) {
            // Extract line/position from SQL error messages:
            //   PostgreSQL "LINE N:", MySQL "at line N", Postgres "at character N"
            const lineCount = errModel.getLineCount();
            let errorLine = 1;
            const lineMatch = message.match(/LINE\s+(\d+)/i);
            if (lineMatch) {
              errorLine = parseInt(lineMatch[1], 10);
            } else {
              const atLineMatch = message.match(/at line (\d+)/i);
              if (atLineMatch) {
                errorLine = parseInt(atLineMatch[1], 10);
              } else {
                const charMatch = message.match(/at character (\d+)/i);
                if (charMatch) {
                  // Convert 1-based character offset to line number by walking lines
                  const charOffset = parseInt(charMatch[1], 10);
                  let currentChar = 0;
                  for (let ln = 1; ln <= lineCount; ln++) {
                    currentChar += errModel.getLineLength(ln) + 1; // +1 for newline
                    if (currentChar >= charOffset) {
                      errorLine = ln;
                      break;
                    }
                  }
                }
              }
            }
            // Clamp line number to valid range
            errorLine = Math.min(errorLine, lineCount);
            m.editor.setModelMarkers(errModel, 'sql-error', [
              {
                severity: m.MarkerSeverity.Error,
                message,
                startLineNumber: errorLine,
                startColumn: 1,
                endLineNumber: errorLine,
                endColumn: errModel.getLineMaxColumn(errorLine),
              },
            ]);
          }
        }
      } finally {
        setIsExecutingBatch(false);
      }
    },
    [runQuery, saveHistory, queryLimit],
  );

  const handleRun = useCallback(() => {
    if (!sql.trim()) return;
    setOffset(0);
    // If text is selected in the editor, execute only the selected text
    let sqlToExecute = sql.trim();
    const editor = editorRef.current;
    if (editor) {
      const selection = editor.getSelection();
      if (selection && !selection.isEmpty()) {
        const selectedText = editor.getModel()?.getValueInRange(selection);
        if (selectedText?.trim()) {
          sqlToExecute = selectedText.trim();
        }
      }
    }
    baseSqlRef.current = sqlToExecute;
    const fullQuery = queryWithLimit(sqlToExecute, queryLimit);
    void executeQuery(fullQuery);
  }, [sql, executeQuery, queryLimit]);

  const goNextPage = useCallback(() => {
    const newOffset = offset + queryLimit;
    setOffset(newOffset);
    const fullQuery = queryWithLimit(baseSqlRef.current, queryLimit, newOffset);
    void executeQuery(fullQuery);
  }, [offset, queryLimit, executeQuery]);

  const goPrevPage = useCallback(() => {
    const newOffset = Math.max(0, offset - queryLimit);
    setOffset(newOffset);
    const fullQuery = queryWithLimit(baseSqlRef.current, queryLimit, newOffset);
    void executeQuery(fullQuery);
  }, [offset, queryLimit, executeQuery]);

  const refreshCurrentResult = useCallback(() => {
    const fullQuery = queryWithLimit(baseSqlRef.current, queryLimit, offset);
    void executeQuery(fullQuery);
  }, [executeQuery, offset, queryLimit]);

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
      editorRef.current = editor;
      monacoRef.current = monaco as unknown as typeof import('monaco-editor');
      editor.focus();

      editor.addAction({
        id: 'run-query',
        label: 'Run Query',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
        run: () => handleRunRef.current(),
      });

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
        <Button size="sm" onClick={handleRun} disabled={runQuery.isPending || isExecutingBatch} className="gap-1.5">
          {runQuery.isPending || isExecutingBatch ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Play className="size-3.5" />
          )}
          Run
        </Button>
        <span className="text-xs text-muted-foreground">
          {runQuery.isPending || isExecutingBatch ? 'Running...' : 'Ctrl+Enter to run'}
        </span>
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
            {(runQuery.isPending || isExecutingBatch) && (
              <div className="flex items-center justify-center py-8">
                <Spinner size="lg" />
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 p-4 text-sm text-destructive">
                <AlertCircle className="size-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Multi-statement result tabs */}
            {results.length > 0 && results[activeResultIndex] && (
              <>
                <div className="flex items-center gap-0.5 px-4 pt-2 pb-1 border-b border-border shrink-0">
                  {results.map((_, i) => (
                    <Button
                      key={i}
                      variant="ghost"
                      size="sm"
                      onClick={() => setActiveResultIndex(i)}
                      className={`px-2.5 py-1 text-xs rounded-t transition-colors ${
                        i === activeResultIndex
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                      }`}
                    >
                      Result {i + 1}
                    </Button>
                  ))}
                </div>
                <div className="flex-1 overflow-auto">
                  {showChart ? (
                    <ChartView
                      key={`chart-${resultKeyRef.current}-${activeResultIndex}`}
                      result={results[activeResultIndex]}
                    />
                  ) : (
                    <QueryResultTable
                      key={`${resultKeyRef.current}-${activeResultIndex}`}
                      connectionId={connectionId}
                      executedSql={executedStatements[activeResultIndex] ?? baseSqlRef.current}
                      result={results[activeResultIndex]}
                      onSelectRow={setSelectedRow}
                      onRefresh={refreshCurrentResult}
                      queryLimit={queryLimit}
                      offset={offset}
                      onPrevPage={goPrevPage}
                      onNextPage={goNextPage}
                      onLimitChange={(newLimit) => {
                        setQueryLimit(newLimit);
                        setOffset(0);
                        const currentSql = sql.trim();
                        if (currentSql) {
                          const fullQuery = queryWithLimit(currentSql, newLimit);
                          void executeQuery(fullQuery);
                        }
                      }}
                    />
                  )}
                </div>
              </>
            )}

            {result &&
              results.length === 0 &&
              (showChart ? (
                <ChartView key={`chart-${resultKeyRef.current}`} result={result} />
              ) : (
                <QueryResultTable
                  key={resultKeyRef.current}
                  connectionId={connectionId}
                  executedSql={executedStatements[0] ?? baseSqlRef.current}
                  result={result}
                  onSelectRow={setSelectedRow}
                  onRefresh={refreshCurrentResult}
                  queryLimit={queryLimit}
                  offset={offset}
                  onPrevPage={goPrevPage}
                  onNextPage={goNextPage}
                  onLimitChange={(newLimit) => {
                    setQueryLimit(newLimit);
                    setOffset(0);
                    const currentSql = sql.trim();
                    if (currentSql) {
                      const fullQuery = queryWithLimit(currentSql, newLimit);
                      void executeQuery(fullQuery);
                    }
                  }}
                />
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
