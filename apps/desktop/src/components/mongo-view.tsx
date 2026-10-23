import { useState, useCallback, useMemo, useReducer, useRef, useEffect } from 'react';
import { debounce } from '@tanstack/pacer';
import { useMongoDocuments, useMongoCollectionStats } from '@/hooks/use-mongo';
import { api } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/lib/query-keys';
import { AlertCircle, Activity } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { WorkspaceTab } from '@/lib/types';
import { safeErrorMessage } from '@kamehadb/shared';
import { DocumentCard } from '@/components/mongo-document-card';
import { DocumentTableView } from '@/components/mongo-document-table-view';
import { MongoViewHeader } from '@/components/mongo-view-header';
import { appendFrontendLog } from '@/lib/app-logs';
import { MongoStatsPanel } from '@/components/mongo-stats-panel';
import { DataFooter } from '@/components/mongo-data-footer';
import { useGUIRequests } from '@/hooks/use-gui-requests';
import { pageOffsetsFor } from '@/lib/page-offsets';
import { collectRecordFields } from '@/hooks/use-field-visibility';
import { PAGE_LIMIT } from '@/lib/constants';
import { saveTextAs } from '@/lib/export';
import { toastError, toastSuccess } from '@/lib/toast';

function parseJsonSafe(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

interface MongoViewProps {
  tab: Extract<WorkspaceTab, { type: 'mongo' }>;
  connectionId: string;
}

// Group all list/table/search state into a single reducer so a single
// dispatch produces a single re-render instead of seven.
type MongoState = {
  activeTab: 'data' | 'stats';
  viewMode: 'list' | 'table';
  searchText: string;
  sortStr: string;
  page: number;
  querySearch: string;
  querySort: string;
};

type MongoAction =
  | { type: 'activeTab'; value: 'data' | 'stats' }
  | { type: 'viewMode'; value: 'list' | 'table' }
  | { type: 'searchText'; value: string }
  | { type: 'sortStr'; value: string | ((prev: string) => string) }
  | { type: 'page'; value: number }
  | { type: 'querySearch'; value: string }
  | { type: 'querySort'; value: string | ((prev: string) => string) };

const INITIAL_MONGO_STATE: MongoState = {
  activeTab: 'data',
  viewMode: 'table',
  searchText: '',
  sortStr: '',
  page: 0,
  querySearch: '',
  querySort: '',
};

function mongoReducer(state: MongoState, action: MongoAction): MongoState {
  switch (action.type) {
    case 'activeTab':
      return { ...state, activeTab: action.value };
    case 'viewMode':
      return { ...state, viewMode: action.value };
    case 'searchText':
      return { ...state, searchText: action.value };
    case 'sortStr':
      return { ...state, sortStr: typeof action.value === 'function' ? action.value(state.sortStr) : action.value };
    case 'page':
      return { ...state, page: action.value };
    case 'querySearch':
      return { ...state, querySearch: action.value };
    case 'querySort':
      return { ...state, querySort: typeof action.value === 'function' ? action.value(state.querySort) : action.value };
  }
}

function useDebouncedSearchQuery(dispatch: React.Dispatch<MongoAction>, onReset: () => void) {
  // Debounce user keystrokes into a "querySearch" + page-reset so the
  // expensive fetch isn't triggered on every keypress.
  return useMemo(
    () =>
      debounce(
        (v: string) => {
          dispatch({ type: 'querySearch', value: v });
          dispatch({ type: 'page', value: 0 });
          onReset();
        },
        { wait: 300 },
      ),
    [dispatch, onReset],
  );
}

export function MongoView({ tab, connectionId }: MongoViewProps) {
  const { database, collection } = tab;
  const queryClient = useQueryClient();

  const [state, dispatch] = useReducer(mongoReducer, INITIAL_MONGO_STATE);

  // Page index → exact skip offset. Byte-bounded pages can admit fewer than
  // PAGE_LIMIT documents, so the next page's skip must come from the admitted
  // count — page*PAGE_LIMIT would silently skip documents. sawByteLimitedPage
  // disables arbitrary page jumps: offsets for unvisited pages only exist when
  // every visited page was full. (Why)
  const [pageOffsets, setPageOffsets] = useState<number[]>([0]);
  const [sawByteLimitedPage, setSawByteLimitedPage] = useState(false);
  const [countResult, setCountResult] = useState<{
    count: number | string;
    mode: string;
    error?: string;
    pending?: boolean;
  } | null>(null);
  const resetPaging = useCallback(() => {
    setPageOffsets([0]);
    setSawByteLimitedPage(false);
    setCountResult(null);
  }, []);
  const debouncedSetQuerySearch = useDebouncedSearchQuery(dispatch, resetPaging);

  const handleSearchChange = useCallback(
    (v: string) => {
      dispatch({ type: 'searchText', value: v });
      debouncedSetQuerySearch(v);
    },
    [debouncedSetQuerySearch],
  );

  const handleSortChange = useCallback(
    (v: string) => {
      dispatch({ type: 'sortStr', value: v });
      dispatch({ type: 'querySort', value: v });
      dispatch({ type: 'page', value: 0 });
      resetPaging();
    },
    [resetPaging],
  );

  const toggleSortField = useCallback(
    (field: string | null) => {
      if (!field) return;
      dispatch({
        type: 'sortStr',
        value: (prev) => {
          try {
            const parsed = JSON.parse(prev);
            if (typeof parsed === 'object' && !Array.isArray(parsed) && Object.keys(parsed)[0] === field) {
              const dir = Object.values(parsed)[0];
              if (dir === 1) {
                const next = JSON.stringify({ [field]: -1 });
                dispatch({ type: 'querySort', value: next });
                return next;
              }
              if (dir === -1) {
                dispatch({ type: 'querySort', value: '' });
                return '';
              }
            }
          } catch (err) {
            // Invalid JSON is expected while the user is typing the sort spec —
            // treat it as unsorted and start fresh. Debug-level to avoid spam.
            console.debug('mongo sort spec parse failed:', err);
          }
          const next = JSON.stringify({ [field]: 1 });
          dispatch({ type: 'querySort', value: next });
          return next;
        },
      });
      dispatch({ type: 'page', value: 0 });
      resetPaging();
    },
    [resetPaging],
  );

  const sortParsed = useMemo(() => {
    const parsed = parseJsonSafe(state.querySort);
    if (!parsed) return undefined;
    if (typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
    return Object.values(parsed).every((v) => v === 1 || v === -1) ? (parsed as Record<string, 1 | -1>) : undefined;
  }, [state.querySort]);

  // Offsets are recorded per visited page so byte-shortened pages advance by
  // the admitted document count, not the requested page size.
  const skip = pageOffsets[state.page] ?? state.page * PAGE_LIMIT;
  const { data, isLoading, error, isFetching, isPlaceholderData, refetch } = useMongoDocuments(
    connectionId,
    database,
    collection,
    {},
    sortParsed ?? {},
    PAGE_LIMIT,
    skip,
    state.querySearch || undefined,
  );

  // Byte-limited pages make unvisited offsets unknowable — remember and gate
  // the page-jump input on it. Placeholder pages from the previous context
  // (keepPreviousData) must not set the flag, and a fresh page re-reporting
  // 'bytes' must re-set it — so key off the result object, not the string.
  useEffect(() => {
    if (!isPlaceholderData && data?.limitReason === 'bytes') setSawByteLimitedPage(true);
  }, [data, isPlaceholderData]);

  const {
    data: statsData,
    isLoading: statsLoading,
    error: statsError,
  } = useMongoCollectionStats(connectionId, database, collection);

  // Explicit count state: pages never count implicitly. The query key change
  // (filter/search/sort/page-size) is what invalidates a displayed count —
  // reset it on every effective-query change. (What/Why)
  const countEpoch = JSON.stringify({
    s: state.querySearch,
    q: state.querySort,
  });
  const lastCountEpoch = useRef(countEpoch);
  if (lastCountEpoch.current !== countEpoch) {
    lastCountEpoch.current = countEpoch;
    if (countResult) setCountResult(null);
  }

  // Count requests are separately cancellable through the request owner; the
  // scope ties them to this connection+namespace only.
  const requests = useGUIRequests(`${connectionId}:${database}:${collection}`);

  const handleCount = useCallback(
    async (mode: 'estimated' | 'exact') => {
      const epoch = lastCountEpoch.current;
      setCountResult({ count: 0, mode, pending: true });
      try {
        const res = await requests.run((signal) =>
          api.countMongoDocuments(
            connectionId,
            {
              collection,
              database,
              search: state.querySearch || undefined,
              mode,
            },
            signal,
          ),
        );
        // Drop late completions whose query context already moved on.
        if (!requests.isCurrent() || epoch !== lastCountEpoch.current) return;
        setCountResult({ count: res.count, mode: res.countMode });
      } catch (err) {
        if (!requests.isCurrent() || epoch !== lastCountEpoch.current) return;
        // A failed count must never hide already-fetched documents.
        setCountResult({ count: 0, mode, error: safeErrorMessage(err) });
      }
    },
    [connectionId, collection, database, state.querySearch, requests],
  );

  const [expandedDocs, setExpandedDocs] = useState<Set<number>>(new Set());

  const toggleDoc = useCallback((index: number) => {
    setExpandedDocs((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const handleExportJSON = useCallback(() => {
    if (!data?.documents.length) return;
    const json = JSON.stringify(data.documents, null, 2);
    void saveTextAs(json, `${collection}-${Date.now()}.json`, 'JSON files', '*.json', data.documents.length);
  }, [data, collection]);

  // Copy the same pretty-printed JSON the export produces, straight to clipboard.
  const handleCopyJSON = useCallback(async () => {
    if (!data?.documents.length) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(data.documents, null, 2));
      toastSuccess('JSON copied to clipboard');
    } catch {
      toastError('Failed to copy JSON to clipboard');
    }
  }, [data]);

  const handleExportCSV = useCallback(() => {
    if (!data?.documents.length) return;
    const docs = data.documents;
    const headers = Array.from(
      docs.reduce<Set<string>>((acc, doc) => {
        Object.keys(doc).forEach((k) => acc.add(k));
        return acc;
      }, new Set()),
    );
    const escape = (v: unknown) => {
      const s = String(v ?? '');
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = docs.map((doc) => headers.map((h) => escape(doc[h])).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    void saveTextAs(csv, `${collection}-${Date.now()}.csv`, 'CSV files', '*.csv', docs.length);
  }, [data, collection]);

  const invalidateDocuments = useCallback(() => {
    // Writes can change ordering and byte-page boundaries, so discard offsets
    // and restart at the first page before fetching the changed collection.
    dispatch({ type: 'page', value: 0 });
    resetPaging();
    queryClient.invalidateQueries({
      queryKey: QUERY_KEYS.MONGO_DOCUMENTS_PREFIX(connectionId, database, collection),
    });
  }, [connectionId, database, collection, queryClient, resetPaging]);

  const handleDeleteDocument = useCallback(
    async (doc: Record<string, unknown>) => {
      if (!doc._id) return;
      const confirmed = confirm(`Delete this document?\n\n${JSON.stringify(doc, null, 2).slice(0, 200)}...`);
      if (!confirmed) return;
      try {
        await api.deleteMongoDocument(connectionId, { collection, database, filter: { _id: doc._id } });
        invalidateDocuments();
      } catch (err) {
        const message = safeErrorMessage(err);
        alert(`Delete failed: ${message}`);
        void appendFrontendLog({
          level: 'error',
          scope: 'mongo-view.delete',
          message: `MongoDB delete failed: ${message}`,
          details: err instanceof Error ? err.stack : String(err),
        });
      }
    },
    [connectionId, collection, database, invalidateDocuments],
  );

  const currentSortField = useMemo(() => {
    try {
      const parsed = JSON.parse(state.sortStr);
      const entry = Object.entries(parsed)[0];
      if (entry && (entry[1] === 1 || entry[1] === -1)) return entry[0];
    } catch (err) {
      console.debug('mongo sort field parse failed:', err);
    }
    return '';
  }, [state.sortStr]);

  const currentSortLabel = useMemo(() => {
    try {
      const parsed = JSON.parse(state.sortStr);
      const entry = Object.entries(parsed)[0];
      if (entry && (entry[1] === 1 || entry[1] === -1)) {
        return `${entry[0]} ${entry[1] === 1 ? '↑' : '↓'}`;
      }
    } catch (err) {
      console.debug('mongo sort label parse failed:', err);
    }
    return null;
  }, [state.sortStr]);

  const sortFields = useMemo(() => collectRecordFields(data?.documents ?? []), [data]);

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const onPageChange = useCallback(
    (p: number) => {
      setPageOffsets((prev) => pageOffsetsFor(prev, p, state.page, data?.documents.length ?? PAGE_LIMIT, PAGE_LIMIT));
      dispatch({ type: 'page', value: p });
    },
    [state.page, data?.documents.length],
  );

  return (
    <div className="h-full flex flex-col bg-background">
      <MongoViewHeader
        title={collection}
        count={data?.documents.length ?? 0}
        searchText={state.searchText}
        onSearchChange={handleSearchChange}
        sortField={currentSortField}
        sortFields={sortFields}
        onSortFieldChange={toggleSortField}
        onClearSort={() => handleSortChange('')}
        showSortClear={!!currentSortLabel}
        viewMode={state.viewMode}
        onViewModeChange={(v) => dispatch({ type: 'viewMode', value: v })}
        isFetching={isFetching}
        onRefresh={onRefresh}
      />

      <Tabs
        value={state.activeTab}
        onValueChange={(v) => dispatch({ type: 'activeTab', value: v as 'data' | 'stats' })}
        className="flex-1 flex flex-col min-h-0"
      >
        <div className="px-4 pt-2">
          <TabsList>
            <TabsTrigger value="data" className="text-xs">
              Data
            </TabsTrigger>
            <TabsTrigger value="stats" className="text-xs">
              <Activity className="size-3 mr-1" />
              Stats
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="data" className="flex-1 flex flex-col min-h-0">
          <DocumentsPanel
            isLoading={isLoading}
            error={error}
            documents={data?.documents ?? []}
            viewMode={state.viewMode}
            page={state.page}
            pageSize={PAGE_LIMIT}
            totalCount={countResult?.count ?? data?.totalCount}
            countMode={countResult?.mode ?? data?.countMode}
            countPending={countResult?.pending}
            countError={countResult?.error ?? null}
            onCount={handleCount}
            hasMore={data?.hasMore ?? false}
            durationMs={data?.durationMs ?? 0}
            isFetching={isFetching}
            sortStr={state.sortStr}
            connectionId={connectionId}
            database={database}
            collection={collection}
            expandedDocs={expandedDocs}
            onToggleDoc={toggleDoc}
            onDelete={handleDeleteDocument}
            onUpdate={invalidateDocuments}
            onSortFieldChange={toggleSortField}
            onPageChange={onPageChange}
            startRow={skip}
            disablePageJump={sawByteLimitedPage}
            onExportJSON={handleExportJSON}
            onExportCSV={handleExportCSV}
            onCopyJSON={handleCopyJSON}
            indexes={statsData?.indexes ?? []}
            statsLoading={statsLoading}
            statsError={statsError}
          />
        </TabsContent>

        <TabsContent value="stats" className="flex-1 overflow-auto p-4">
          <MongoStatsPanel connectionId={connectionId} database={database} collection={collection} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface DocumentsPanelProps {
  isLoading: boolean;
  error: unknown;
  documents: Record<string, unknown>[];
  viewMode: 'list' | 'table';
  page: number;
  pageSize: number;
  totalCount?: number | string;
  countMode?: string;
  countPending?: boolean;
  countError?: string | null;
  onCount?: (mode: 'estimated' | 'exact') => void;
  hasMore: boolean;
  durationMs: number;
  isFetching: boolean;
  sortStr: string;
  connectionId: string;
  database: string;
  collection: string;
  expandedDocs: Set<number>;
  onToggleDoc: (index: number) => void;
  onDelete: (doc: Record<string, unknown>) => void;
  onUpdate: () => void;
  onSortFieldChange: (field: string | null) => void;
  onPageChange: (page: number) => void;
  startRow: number;
  disablePageJump: boolean;
  onExportJSON: () => void;
  onExportCSV: () => void;
  onCopyJSON: () => void;
  indexes: { name: string; key: Record<string, unknown>; unique: boolean }[];
  statsLoading: boolean;
  statsError: unknown;
}

function DocumentsPanel({
  isLoading,
  error,
  documents,
  viewMode,
  page,
  pageSize,
  totalCount,
  countMode,
  countPending,
  countError,
  onCount,
  hasMore,
  durationMs,
  isFetching,
  sortStr,
  connectionId,
  database,
  collection,
  expandedDocs,
  onToggleDoc,
  onDelete,
  onUpdate,
  onSortFieldChange,
  onPageChange,
  startRow,
  disablePageJump,
  onExportJSON,
  onExportCSV,
  onCopyJSON,
  indexes,
  statsLoading,
  statsError,
}: DocumentsPanelProps) {
  const footerProps = {
    page,
    pageSize,
    startRow,
    disablePageJump,
    isFetching,
    totalCount,
    countMode,
    countPending,
    countError,
    onCount,
    hasMore,
    durationMs,
    onPageChange,
    onExportJSON,
    onExportCSV,
    onCopyJSON,
  };

  if (isLoading) {
    return (
      <div className="p-4">
        <div className="flex items-center justify-center h-32">
          <Spinner size="lg" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="flex items-center justify-center h-32 text-destructive">
          <AlertCircle className="size-5 mr-2" />
          {error instanceof Error ? error.message : 'Failed to load documents'}
        </div>
      </div>
    );
  }

  if (!documents.length) {
    // Extract indexed field names from index keys to show as "schema" hints.
    // Only show index info when stats have loaded successfully — while loading
    // or on error, show a neutral message instead of falsely claiming "no indexes".
    const indexedFields = new Set<string>();
    for (const idx of indexes) {
      for (const field of Object.keys(idx.key)) {
        indexedFields.add(field);
      }
    }
    return (
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-center h-20 text-muted-foreground">
          No documents found in this collection
        </div>
        {statsLoading ? (
          <div className="rounded-lg border border-border bg-muted/30 p-4 text-center">
            <p className="text-xs text-muted-foreground">Loading index information…</p>
          </div>
        ) : statsError ? (
          <div className="rounded-lg border border-border bg-muted/30 p-4 text-center">
            <p className="text-xs text-muted-foreground">
              Could not load index information. Check the Stats tab for details.
            </p>
          </div>
        ) : indexedFields.size > 0 ? (
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Indexed fields (from {indexes.length} index{indexes.length !== 1 ? 'es' : ''}):
            </p>
            <div className="flex flex-wrap gap-1.5">
              {Array.from(indexedFields).map((field) => (
                <span key={field} className="rounded bg-primary/10 px-2 py-0.5 font-mono text-xs text-primary">
                  {field}
                </span>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3">Switch to the Stats tab to see full index details.</p>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-muted/30 p-4 text-center">
            <p className="text-xs text-muted-foreground">
              This collection has no indexes. Insert a document to start building its schema.
            </p>
          </div>
        )}
      </div>
    );
  }

  if (viewMode === 'table') {
    return (
      <div className="flex flex-col flex-1 h-full min-h-0 p-4 pt-2 gap-0">
        <div className="min-h-0 flex-1 flex flex-col border border-border rounded-md overflow-hidden">
          <DocumentTableView
            documents={documents}
            connectionId={connectionId}
            collection={collection}
            database={database}
            onDelete={onDelete}
            onUpdate={onUpdate}
            sortStr={sortStr}
            onSortChange={onSortFieldChange}
          />
          <DataFooter rowCount={documents.length} {...footerProps} />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 flex flex-col flex-1 min-h-0">
      <div className="text-xs text-muted-foreground mb-2 flex items-center justify-between">
        <span>
          {documents.length} document{documents.length !== 1 ? 's' : ''} returned
          {hasMore && <span className="text-muted-foreground ml-1">(has more)</span>}
        </span>
        {isFetching && (
          <span className="flex items-center gap-1 text-muted-foreground">
            <Spinner size="sm" />
            Loading...
          </span>
        )}
      </div>
      <ul className="space-y-2 min-h-0 flex-1 overflow-y-auto">
        {documents.map((doc, index) => (
          <DocumentCard
            key={doc._id ? String(doc._id) : index}
            doc={doc}
            isExpanded={expandedDocs.has(index)}
            onToggle={() => onToggleDoc(index)}
            onDelete={() => onDelete(doc)}
            onUpdate={onUpdate}
            connectionId={connectionId}
            collection={collection}
            database={database}
            tabIndex={0}
          />
        ))}
      </ul>
      <DataFooter rowCount={documents.length} className="mt-2" {...footerProps} />
    </div>
  );
}
