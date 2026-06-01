import { useState, useCallback, useRef, useEffect } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import { useQuery } from '@tanstack/react-query';
import { get, post } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Play, Loader2, AlertCircle, ChevronLeft, ChevronRight, Database, Table2 } from 'lucide-react';
import JSON5 from 'json5';
import type { WorkspaceTab, DocumentResult, CollectionInfo, DatabaseInfo } from '@kamehadb/shared';
import { updateTabPipeline } from '@/store';

type MongoQueryProps = {
  tab: WorkspaceTab & { pipeline?: string };
  connectionId: string;
};

export function MongoQuery({ tab, connectionId }: MongoQueryProps) {
  const initialDatabase = 'database' in tab && tab.database ? tab.database : '';
  const initialCollection = 'collection' in tab && tab.collection ? tab.collection : '';

  const [pipeline, setPipeline] = useState(tab.pipeline || '[\n  { $match: {} }\n]');
  const [db, setDb] = useState(initialDatabase);
  const [collection, setCollection] = useState(initialCollection);
  const [result, setResult] = useState<DocumentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  const handlePipelineChange = useCallback(
    (v: string | undefined) => {
      const value = v ?? '';
      setPipeline(value);
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
    queryKey: ['mongo-collections', connectionId, db],
    queryFn: () => get<CollectionInfo[]>(`/mongo/${connectionId}/collections?database=${encodeURIComponent(db)}`),
    enabled: !!connectionId && !!db,
  });

  const handleRun = useCallback(
    async (p?: number) => {
      if (!collection || !db) return;
      const currentPage = p ?? 0;
      setError(null);
      setResult(null);
      setRunning(true);
      if (!p) setPage(0);

      try {
        let parsed: Record<string, unknown>[];
        try {
          parsed = JSON5.parse(pipeline);
          if (!Array.isArray(parsed)) throw new Error();
        } catch {
          throw new Error('Invalid aggregation pipeline — check syntax');
        }

        const res = await post<DocumentResult>(`/mongo/${connectionId}/aggregate`, {
          collection,
          database: db,
          pipeline: parsed,
          skip: currentPage * PAGE_SIZE,
          limit: PAGE_SIZE,
        });
        setResult(res);
        setPage(currentPage);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Aggregation failed');
      } finally {
        setRunning(false);
      }
    },
    [collection, db, pipeline, connectionId],
  );

  const handleRunRef = useRef(handleRun);
  useEffect(() => {
    handleRunRef.current = handleRun;
  }, [handleRun]);

  const handleEditorDidMount: OnMount = useCallback((editor, monaco) => {
    editor.focus();

    editor.addAction({
      id: 'run-aggregation',
      label: 'Run Aggregation',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
      run: () => handleRunRef.current(),
    });
  }, []);

  const handleDbChange = useCallback((value: string | null) => {
    if (value) {
      setDb(value);
      setCollection('');
    }
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0">
        {/* Database selector */}
        <Select value={db} onValueChange={handleDbChange}>
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

        {/* Separator */}
        <ChevronRight className="size-3 shrink-0 text-muted-foreground/30" />

        {/* Collection selector */}
        <Select value={collection} onValueChange={(v) => v && setCollection(v)} disabled={!db}>
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

        {/* Run / status group */}
        <div className="flex items-center gap-1.5">
          <Button
            variant={running ? 'secondary' : 'default'}
            size="sm"
            onClick={() => handleRun()}
            disabled={!collection || running}
            className="h-7 text-xs gap-1.5 px-3"
          >
            {running ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5 fill-current" />}
            {running ? 'Running' : 'Run'}
          </Button>
          {result && !running && (
            <span className="text-[11px] text-muted-foreground tabular-nums">{result.totalCount.toLocaleString()}</span>
          )}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
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

      <div className="flex-1 min-h-0 border-b border-border">
        <Editor
          height="100%"
          defaultLanguage="javascript"
          theme="vs-dark"
          value={pipeline}
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
      </div>

      <div className="p-4 overflow-y-auto">
        {running && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 text-sm text-destructive">
            <AlertCircle className="size-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {result && (
          <>
            <div className="border rounded-md overflow-x-auto">
              {result.documents.length > 0 &&
                (() => {
                  const columns = Array.from(new Set(result.documents.flatMap((d) => Object.keys(d))));
                  return (
                    <>
                      <div
                        className="grid text-xs bg-muted/50"
                        style={{
                          gridTemplateColumns: `repeat(${columns.length}, minmax(140px, 1fr))`,
                        }}
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
                          key={i}
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
                    </>
                  );
                })()}
            </div>
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
                    max={Math.max(1, Math.ceil(result.totalCount / PAGE_SIZE))}
                    value={page + 1}
                    onChange={(e) => {
                      const p = parseInt(e.target.value, 10);
                      if (!isNaN(p) && p >= 1) {
                        handleRun(p - 1);
                      }
                    }}
                    className="h-7 w-14 text-xs text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <span>of {Math.max(1, Math.ceil(result.totalCount / PAGE_SIZE))}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === 0}
                    onClick={() => handleRun(page - 1)}
                    className="h-7 text-xs"
                  >
                    <ChevronLeft className="size-3 mr-1" />
                    Prev
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!result.hasMore}
                    onClick={() => handleRun(page + 1)}
                    className="h-7 text-xs"
                  >
                    Next
                    <ChevronRight className="size-3 ml-1" />
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
