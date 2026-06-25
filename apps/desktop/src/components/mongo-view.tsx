import { useState, useCallback, useMemo, useReducer } from 'react';
import { debounce } from '@tanstack/pacer';
import { useMongoDocuments } from '@/hooks/use-mongo';
import { api } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/lib/query-keys';
import { AlertCircle, Activity } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChartView } from '@/components/chart-view';
import type { WorkspaceTab } from '@/lib/types';
import type { QueryResult } from '@kamehadb/shared';
import { DocumentCard } from '@/components/mongo-document-card';
import { DocumentTableView } from '@/components/mongo-document-table-view';
import { MongoViewHeader } from '@/components/mongo-view-header';
import { appendFrontendLog } from '@/lib/app-logs';
import { MongoStatsPanel } from '@/components/mongo-stats-panel';
import { DataFooter } from '@/components/mongo-data-footer';
import { collectRecordFields } from '@/hooks/use-field-visibility';
import { PAGE_LIMIT } from '@/lib/constants';

// Derive column metadata from every document so sparse Mongo fields remain
// available to chart and table consumers.
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
  viewMode: 'list' | 'table' | 'chart';
  searchText: string;
  sortStr: string;
  page: number;
  querySearch: string;
  querySort: string;
};

type MongoAction =
  | { type: 'activeTab'; value: 'data' | 'stats' }
  | { type: 'viewMode'; value: 'list' | 'table' | 'chart' }
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

function useDebouncedSearchQuery(dispatch: React.Dispatch<MongoAction>) {
  // Debounce user keystrokes into a "querySearch" + page-reset so the
  // expensive fetch isn't triggered on every keypress.
  return useMemo(
    () =>
      debounce(
        (v: string) => {
          dispatch({ type: 'querySearch', value: v });
          dispatch({ type: 'page', value: 0 });
        },
        { wait: 300 },
      ),
    [dispatch],
  );
}

export function MongoView({ tab, connectionId }: MongoViewProps) {
  const { database, collection } = tab;
  const queryClient = useQueryClient();

  const [state, dispatch] = useReducer(mongoReducer, INITIAL_MONGO_STATE);
  const debouncedSetQuerySearch = useDebouncedSearchQuery(dispatch);

  const handleSearchChange = useCallback(
    (v: string) => {
      dispatch({ type: 'searchText', value: v });
      debouncedSetQuerySearch(v);
    },
    [debouncedSetQuerySearch],
  );

  const handleSortChange = useCallback((v: string) => {
    dispatch({ type: 'sortStr', value: v });
    dispatch({ type: 'querySort', value: v });
    dispatch({ type: 'page', value: 0 });
  }, []);

  const toggleSortField = useCallback((field: string | null) => {
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
        } catch {}
        const next = JSON.stringify({ [field]: 1 });
        dispatch({ type: 'querySort', value: next });
        return next;
      },
    });
    dispatch({ type: 'page', value: 0 });
  }, []);

  const sortParsed = useMemo(() => {
    const parsed = parseJsonSafe(state.querySort);
    if (!parsed) return undefined;
    if (typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
    return Object.values(parsed).every((v) => v === 1 || v === -1) ? (parsed as Record<string, 1 | -1>) : undefined;
  }, [state.querySort]);

  const skip = state.page * PAGE_LIMIT;
  const { data, isLoading, error, isFetching, refetch } = useMongoDocuments(
    connectionId,
    database,
    collection,
    {},
    sortParsed ?? {},
    PAGE_LIMIT,
    skip,
    state.querySearch || undefined,
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
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${collection}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [data, collection]);

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
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${collection}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [data, collection]);

  const handleDeleteDocument = useCallback(
    async (doc: Record<string, unknown>) => {
      if (!doc._id) return;
      const confirmed = confirm(`Delete this document?\n\n${JSON.stringify(doc, null, 2).slice(0, 200)}...`);
      if (!confirmed) return;
      try {
        await api.deleteMongoDocument(connectionId, { collection, database, filter: { _id: doc._id } });
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.MONGO_DOCUMENTS_PREFIX(connectionId, database, collection),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        alert(`Delete failed: ${message}`);
        void appendFrontendLog({
          level: 'error',
          scope: 'mongo-view.delete',
          message: `MongoDB delete failed: ${message}`,
          details: err instanceof Error ? err.stack : String(err),
        });
      }
    },
    [connectionId, collection, database, queryClient],
  );

  const currentSortField = useMemo(() => {
    try {
      const parsed = JSON.parse(state.sortStr);
      const entry = Object.entries(parsed)[0];
      if (entry && (entry[1] === 1 || entry[1] === -1)) return entry[0];
    } catch {}
    return '';
  }, [state.sortStr]);

  const currentSortLabel = useMemo(() => {
    try {
      const parsed = JSON.parse(state.sortStr);
      const entry = Object.entries(parsed)[0];
      if (entry && (entry[1] === 1 || entry[1] === -1)) {
        return `${entry[0]} ${entry[1] === 1 ? '↑' : '↓'}`;
      }
    } catch {}
    return null;
  }, [state.sortStr]);

  const sortFields = useMemo(() => collectRecordFields(data?.documents ?? []), [data]);

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const invalidateDocuments = useCallback(
    () =>
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.MONGO_DOCUMENTS_PREFIX(connectionId, database, collection),
      }),
    [connectionId, database, collection, queryClient],
  );

  return (
    <div className="h-full flex flex-col bg-background">
      <MongoViewHeader
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
        onExportJSON={handleExportJSON}
        onExportCSV={handleExportCSV}
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
            totalCount={data?.totalCount ?? 0}
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
            onPageChange={(p) => dispatch({ type: 'page', value: p })}
            onExportJSON={handleExportJSON}
            onExportCSV={handleExportCSV}
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
  viewMode: 'list' | 'table' | 'chart';
  page: number;
  pageSize: number;
  totalCount: number;
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
  onExportJSON: () => void;
  onExportCSV: () => void;
}

function DocumentsPanel({
  isLoading,
  error,
  documents,
  viewMode,
  page,
  pageSize,
  totalCount,
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
  onExportJSON,
  onExportCSV,
}: DocumentsPanelProps) {
  const footerProps = {
    page,
    pageSize,
    totalCount,
    hasMore,
    durationMs,
    onPageChange,
    onExportJSON,
    onExportCSV,
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
    return (
      <div className="p-4">
        <div className="flex items-center justify-center h-32 text-muted-foreground">No documents found</div>
      </div>
    );
  }

  if (viewMode === 'chart') {
    const chartResult: QueryResult = {
      columns: deriveColumns(documents),
      rows: documents,
      rowCount: totalCount,
      durationMs,
      truncated: hasMore,
    };
    return (
      <div className="p-4">
        <ChartView result={chartResult} />
      </div>
    );
  }

  if (viewMode === 'table') {
    return (
      <div className="flex flex-col flex-1 h-full min-h-0 p-4 pt-2 gap-0">
        <div className="min-h-0 max-h-full flex flex-col border border-border rounded-md overflow-hidden">
          <div className="overflow-auto min-h-0">
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
          </div>
          <DataFooter rowCount={documents.length} {...footerProps} />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
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
      <ul className="space-y-2">
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
      <DataFooter rowCount={documents.length} isFetching={isFetching} className="mt-2" {...footerProps} />
    </div>
  );
}
