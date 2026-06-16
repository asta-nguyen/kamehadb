import { lazy, Suspense, useCallback, useReducer, useRef, useState } from 'react';
import type { OnMount } from '@monaco-editor/react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { get, post } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChartView } from '@/components/chart-view';
import { collectRecordFields } from '@/hooks/use-field-visibility';
import {
  Play,
  Loader2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Database,
  Table2,
  BarChart3,
  Braces,
} from 'lucide-react';
import JSON5 from 'json5';
import type { WorkspaceTab, DocumentResult, CollectionInfo, DatabaseInfo, QueryResult } from '@kamehadb/shared';
import { updateTabPipeline } from '@/store';
import { buildMongoCompletionEntries, type MongoCompletionsData } from '@/lib/mongo-autocomplete';

const Editor = lazy(() => import('@monaco-editor/react').then((m) => ({ default: m.Editor })));

const PAGE_SIZE = 20;

type MongoQueryProps = {
  tab: WorkspaceTab & { pipeline?: string };
  connectionId: string;
};

// Group pipeline/db/collection/result/error/running/page state into one reducer
// so a single dispatch produces a single re-render instead of seven.
type MongoQueryState = {
  pipeline: string;
  db: string;
  collection: string;
  result: DocumentResult | null;
  error: string | null;
  running: boolean;
  page: number;
  showChart: boolean;
};

type MongoQueryAction =
  | { type: 'setPipeline'; value: string }
  | { type: 'setDb'; value: string; resetCollection?: boolean }
  | { type: 'setCollection'; value: string }
  | { type: 'startRun'; page: number }
  | { type: 'finishRun'; result: DocumentResult; page: number }
  | { type: 'failRun'; error: string }
  | { type: 'endRun' }
  | { type: 'setPage'; value: number }
  | { type: 'toggleChart' };

const DEFAULT_PIPELINE = '[\n  { $match: {} }\n]';

function mongoQueryReducer(state: MongoQueryState, action: MongoQueryAction): MongoQueryState {
  switch (action.type) {
    case 'setPipeline':
      return { ...state, pipeline: action.value };
    case 'setDb':
      return { ...state, db: action.value, collection: action.resetCollection ? '' : state.collection };
    case 'setCollection':
      return { ...state, collection: action.value };
    case 'startRun':
      return { ...state, error: null, result: null, running: true, page: action.page };
    case 'finishRun':
      return { ...state, result: action.result, page: action.page, running: false };
    case 'failRun':
      return { ...state, error: action.error, running: false };
    case 'endRun':
      return { ...state, running: false };
    case 'setPage':
      return { ...state, page: action.value };
    case 'toggleChart':
      return { ...state, showChart: !state.showChart };
  }
}

function MongoQueryToolbar({
  db,
  collection,
  databasesLoading,
  collectionsLoading,
  databases,
  collections,
  running,
  resultTotal,
  showChart,
  onDbChange,
  onCollectionChange,
  onRun,
  onToggleChart,
  onFormat,
}: {
  db: string;
  collection: string;
  databasesLoading: boolean;
  collectionsLoading: boolean;
  databases?: DatabaseInfo[];
  collections?: CollectionInfo[];
  running: boolean;
  resultTotal?: number;
  showChart: boolean;
  onDbChange: (v: string | null) => void;
  onCollectionChange: (v: string) => void;
  onRun: () => void;
  onToggleChart: () => void;
  onFormat: () => void;
}) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0">
      <Select value={db} onValueChange={onDbChange}>
        <SelectTrigger className="h-7 w-44 text-xs gap-2 pl-2.5 pr-2">
          <span className="flex items-center gap-1.5 min-w-0">
            {databasesLoading ? (
              <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
            ) : (
              <Database className="size-3.5 shrink-0 text-muted-foreground" />
            )}
            <SelectValue placeholder="Database" />
          </span>
        </SelectTrigger>
        <SelectContent align="start">
          {databases?.map((d) => (
            <SelectItem key={d.name} value={d.name} className="text-xs">
              {d.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <ChevronRight className="size-3 shrink-0 text-muted-foreground/30" />

      <Select value={collection} onValueChange={(v) => v && onCollectionChange(v)} disabled={!db}>
        <SelectTrigger className="h-7 w-52 text-xs gap-2 pl-2.5 pr-2 data-[disabled]:border-dashed data-[disabled]:bg-muted/20 data-[disabled]:opacity-100 data-[disabled]:[&_[data-slot=select-value]]:text-muted-foreground/50">
          <span className="flex items-center gap-1.5 min-w-0">
            {collectionsLoading ? (
              <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
            ) : (
              <Table2 className="size-3.5 shrink-0 text-muted-foreground" />
            )}
            <SelectValue placeholder={db ? 'Collection' : 'Select database first'} />
          </span>
        </SelectTrigger>
        <SelectContent align="start">
          {collections?.map((c) => (
            <SelectItem key={c.name} value={c.name} className="text-xs">
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="w-px h-4 bg-border mx-0.5" />

      <div className="flex items-center gap-1.5">
        <Button
          variant={running ? 'secondary' : 'default'}
          size="sm"
          onClick={onRun}
          disabled={!collection || running}
          className="h-7 text-xs gap-1.5 px-3"
        >
          {running ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5 fill-current" />}
          {running ? 'Running' : 'Run'}
        </Button>
        {resultTotal != null && !running && (
          <span className="text-[11px] text-muted-foreground tabular-nums">{resultTotal.toLocaleString()}</span>
        )}
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <Button
          variant="ghost"
          size="sm"
          onClick={onFormat}
          className="h-7 text-xs gap-1.5 px-2"
          title="Format pipeline"
        >
          <Braces className="size-3.5" />
        </Button>
        {resultTotal != null && !running && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleChart}
            className="h-7 text-xs gap-1.5 px-2"
            title={showChart ? 'Show table' : 'Show chart'}
          >
            {showChart ? <Table2 className="size-3.5" /> : <BarChart3 className="size-3.5" />}
          </Button>
        )}
        {running && (
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-primary animate-pulse" />
            Running
          </span>
        )}
        <kbd className="px-1.5 py-0.5 rounded border border-border/60 bg-muted/30 text-[10px] font-mono text-muted-foreground/50">
          {running ? 'Esc' : 'Ctrl+Enter'}
        </kbd>
      </div>
    </div>
  );
}

function AggregationResult({
  result,
  running,
  error,
  page,
  onPageChange,
}: {
  result: DocumentResult;
  running: boolean;
  error: string | null;
  page: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(result.totalCount / PAGE_SIZE));

  if (running) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-2 text-sm text-destructive">
        <AlertCircle className="size-4 mt-0.5 shrink-0" />
        <span>{error}</span>
      </div>
    );
  }

  const columns = Array.from(new Set(result.documents.flatMap((d) => Object.keys(d))));

  return (
    <>
      {columns.length > 0 && (
        <div className="border rounded-md">
          <div
            className="grid text-xs bg-muted/50"
            style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(140px, 1fr))` }}
          >
            {columns.map((key) => (
              <div
                key={key}
                className="px-3 py-1.5 font-medium text-muted-foreground border-r last:border-r-0 whitespace-nowrap"
              >
                {key}
              </div>
            ))}
          </div>
          {result.documents.map((doc, i) => (
            <div
              key={String(doc._id ?? i)}
              className="grid text-xs border-t border-border/40 hover:bg-muted/30"
              style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(140px, 1fr))` }}
            >
              {columns.map((key) => {
                const val = doc[key];
                return (
                  <div
                    key={key}
                    className="px-3 py-1 border-r last:border-r-0 truncate max-w-60"
                    title={
                      val === null || val === undefined
                        ? ''
                        : String(typeof val === 'object' ? JSON.stringify(val) : val)
                    }
                  >
                    {val === null || val === undefined ? (
                      <span className="text-muted-foreground italic">—</span>
                    ) : typeof val === 'object' ? (
                      <span className="text-muted-foreground">{JSON.stringify(val)}</span>
                    ) : (
                      String(val)
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
        <span>{result.totalCount} documents</span>
        {result.hasMore && (
          <Badge variant="outline" className="text-xs">
            Truncated
          </Badge>
        )}
      </div>
      <div className="flex items-center justify-between pt-3 border-t border-border mt-3">
        <div className="text-xs text-muted-foreground">
          {result.documents.length > 0
            ? `${page * PAGE_SIZE + 1}–${page * PAGE_SIZE + result.documents.length} of ${result.totalCount}`
            : '0 results'}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span>Page</span>
            <Input
              type="number"
              min={1}
              max={totalPages}
              value={page + 1}
              onChange={(e) => {
                const p = parseInt(e.target.value, 10);
                if (!isNaN(p) && p >= 1) onPageChange(p - 1);
              }}
              className="h-7 w-14 text-xs text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <span>of {totalPages}</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => onPageChange(page - 1)}
              className="h-7 text-xs"
            >
              <ChevronLeft className="size-3 mr-1" />
              Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!result.hasMore}
              onClick={() => onPageChange(page + 1)}
              className="h-7 text-xs"
            >
              Next
              <ChevronRight className="size-3 ml-1" />
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

// Derive column metadata from every document so sparse fields remain
// available when ChartView consumes Mongo aggregation results.
function deriveColumns(docs: Record<string, unknown>[]): QueryResult['columns'] {
  if (docs.length === 0) return [];
  return collectRecordFields(docs).map((name) => {
    const val = docs.find((doc) => doc[name] !== undefined)?.[name];
    let type = 'string';
    if (typeof val === 'number') type = Number.isInteger(val) ? 'integer' : 'number';
    else if (typeof val === 'boolean') type = 'boolean';
    else if (val === null) type = 'string';
    return { name, type, nullable: val === null };
  });
}

export function MongoQuery({ tab, connectionId }: MongoQueryProps) {
  const initialDatabase = 'database' in tab && tab.database ? tab.database : '';
  const initialCollection = 'collection' in tab && tab.collection ? tab.collection : '';

  const [state, dispatch] = useReducer(mongoQueryReducer, {
    pipeline: tab.pipeline || DEFAULT_PIPELINE,
    db: initialDatabase,
    collection: initialCollection,
    result: null,
    error: null,
    running: false,
    page: 0,
    showChart: false,
  });

  // Resizable split: editor takes a fraction of the available height
  const [editorRatio, setEditorRatio] = useState(0.55);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDragging.current = true;
      const startY = e.clientY;
      const startRatio = editorRatio;

      const onMouseMove = (me: MouseEvent) => {
        if (!isDragging.current || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const deltaY = me.clientY - startY;
        const deltaRatio = deltaY / rect.height;
        const newRatio = Math.min(0.85, Math.max(0.15, startRatio + deltaRatio));
        setEditorRatio(newRatio);
      };

      const onMouseUp = () => {
        isDragging.current = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [editorRatio],
  );

  const handlePipelineChange = useCallback(
    (v: string | undefined) => {
      const value = v ?? '';
      dispatch({ type: 'setPipeline', value });
      updateTabPipeline(tab.id, value);
    },
    [tab.id],
  );

  const { data: databases, isLoading: databasesLoading } = useQuery({
    queryKey: ['mongo-databases', connectionId],
    queryFn: () => get<DatabaseInfo[]>(`/mongo/${connectionId}/databases`),
    enabled: !!connectionId,
  });

  const { data: collections, isLoading: collectionsLoading } = useQuery({
    queryKey: ['mongo-collections', connectionId, state.db],
    queryFn: () => get<CollectionInfo[]>(`/mongo/${connectionId}/collections?database=${encodeURIComponent(state.db)}`),
    enabled: !!connectionId && !!state.db,
  });

  const { data: completionsData } = useQuery({
    queryKey: ['mongo-completions', connectionId],
    queryFn: () => api.getMongoCompletions(connectionId),
    enabled: !!connectionId,
    staleTime: 5 * 60 * 1000,
  });

  // The Monaco keybinding calls into the latest handleRun without re-binding
  // the editor action — keep a ref so the keybinding stays valid.
  const runRef = useRef<() => Promise<void>>(async () => {});
  const completionsRef = useRef<MongoCompletionsData | null>(null);
  completionsRef.current = completionsData ?? null;
  const handleRun = useCallback(
    async (p?: number) => {
      if (!state.collection || !state.db) return;
      const currentPage = p ?? 0;
      dispatch({ type: 'startRun', page: currentPage });

      try {
        let parsed: Record<string, unknown>[];
        try {
          parsed = JSON5.parse(state.pipeline);
          if (!Array.isArray(parsed)) throw new Error();
        } catch {
          throw new Error('Invalid aggregation pipeline — check syntax');
        }

        const res = await post<DocumentResult>(`/mongo/${connectionId}/aggregate`, {
          collection: state.collection,
          database: state.db,
          pipeline: parsed,
          skip: currentPage * PAGE_SIZE,
          limit: PAGE_SIZE,
        });
        dispatch({ type: 'finishRun', result: res, page: currentPage });
      } catch (err) {
        dispatch({ type: 'failRun', error: err instanceof Error ? err.message : 'Aggregation failed' });
      }
    },
    [state.collection, state.db, state.pipeline, connectionId],
  );
  runRef.current = handleRun;

  const handleEditorDidMount: OnMount = useCallback((editor, monaco) => {
    editor.focus();
    editor.addAction({
      id: 'run-aggregation',
      label: 'Run Aggregation',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
      run: () => {
        runRef.current();
      },
    });

    // Register completion provider for MongoDB aggregation pipeline syntax
    const provider = monaco.languages.registerCompletionItemProvider('javascript', {
      triggerCharacters: ['.', ' ', '$', '{', '[', '"', ':'],
      provideCompletionItems: (model, position) => {
        const data = completionsRef.current;
        if (!data) return { suggestions: [] };

        const textUntil = model.getValueInRange({
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        });

        const suggestions = buildMongoCompletionEntries(textUntil, data).map((item) => ({
          label: item.label,
          kind:
            item.kind === 'stage'
              ? monaco.languages.CompletionItemKind.Function
              : item.kind === 'operator'
                ? monaco.languages.CompletionItemKind.Operator
                : item.kind === 'field'
                  ? monaco.languages.CompletionItemKind.Field
                  : item.kind === 'collection'
                    ? monaco.languages.CompletionItemKind.Struct
                    : monaco.languages.CompletionItemKind.Keyword,
          insertText: item.insertText,
          detail: item.detail,
          sortText: item.sortText,
          range: {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: Math.max(1, position.column - 20),
            endColumn: position.column,
          },
        }));

        return { suggestions };
      },
    });

    editor.onDidDispose(() => provider.dispose());
  }, []);

  const handleDbChange = useCallback((value: string | null) => {
    if (value) dispatch({ type: 'setDb', value, resetCollection: true });
  }, []);

  return (
    <div ref={containerRef} className="flex flex-col h-full">
      <MongoQueryToolbar
        db={state.db}
        collection={state.collection}
        databasesLoading={databasesLoading}
        collectionsLoading={collectionsLoading}
        databases={databases}
        collections={collections}
        running={state.running}
        resultTotal={state.result?.totalCount}
        showChart={state.showChart}
        onDbChange={handleDbChange}
        onCollectionChange={(v) => dispatch({ type: 'setCollection', value: v })}
        onRun={() => handleRun()}
        onToggleChart={() => dispatch({ type: 'toggleChart' })}
        onFormat={() => {
          try {
            const parsed = JSON5.parse(state.pipeline);
            dispatch({ type: 'setPipeline', value: JSON5.stringify(parsed, null, 2) });
          } catch {
            /* invalid pipeline — no-op */
          }
        }}
      />

      <div className="flex flex-col min-h-0 flex-1">
        <div className="min-h-0 border-b border-border" style={{ flex: editorRatio }}>
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-full">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              </div>
            }
          >
            <Editor
              height="100%"
              defaultLanguage="javascript"
              theme="vs-dark"
              value={state.pipeline}
              onChange={handlePipelineChange}
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
          </Suspense>
        </div>

        {/* Draggable resize handle */}
        <div
          role="separator"
          tabIndex={0}
          className="h-1.5 cursor-row-resize shrink-0 relative group hover:bg-accent/50"
          onMouseDown={handleMouseDown}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp') setEditorRatio((r) => Math.max(0.15, r - 0.05));
            if (e.key === 'ArrowDown') setEditorRatio((r) => Math.min(0.85, r + 0.05));
          }}
          aria-label="Resize editor panel"
        >
          <div className="absolute inset-x-2 top-1/2 -translate-y-1/2 h-0.5 rounded-full bg-border transition-colors group-hover:bg-foreground/20" />
        </div>

        <div className="min-h-0 overflow-y-auto" style={{ flex: 1 - editorRatio }}>
          <div className="p-4">
            {state.result && state.showChart ? (
              <ChartView
                result={{
                  columns: deriveColumns(state.result.documents),
                  rows: state.result.documents,
                  rowCount: state.result.totalCount,
                  durationMs: state.result.durationMs,
                  truncated: state.result.hasMore,
                }}
              />
            ) : state.result ? (
              <AggregationResult
                result={state.result}
                running={state.running}
                error={state.error}
                page={state.page}
                onPageChange={(p) => {
                  dispatch({ type: 'setPage', value: p });
                  handleRun(p);
                }}
              />
            ) : state.running ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : state.error ? (
              <div className="flex items-start gap-2 text-sm text-destructive">
                <AlertCircle className="size-4 mt-0.5 shrink-0" />
                <span>{state.error}</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
