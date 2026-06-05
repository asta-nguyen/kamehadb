import { useState, useCallback, useMemo, useRef } from 'react';
import { debounce } from '@tanstack/pacer';
import { useMongoDocuments, useMongoCollectionStats } from '@/hooks/use-mongo';
import { api } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  RefreshCw,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Download,
  Trash2,
  FileJson,
  FileSpreadsheet,
  List,
  Table2,
  Save,
  X,
  Activity,
  ChevronLeft,
  Search,
  ArrowUpDown,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DataTable, type ColumnDef } from '@/components/data-table';
import type { WorkspaceTab } from '@kamehadb/shared';

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

export function MongoView({ tab, connectionId }: MongoViewProps) {
  const { database, collection } = tab;
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'data' | 'stats'>('data');
  const [viewMode, setViewMode] = useState<'list' | 'table'>('table');
  const [searchText, setSearchText] = useState('');
  const [sortStr, setSortStr] = useState('');
  const [page, setPage] = useState(0);
  const [querySearch, setQuerySearch] = useState('');
  const pageLimit = 20;
  const [querySort, setQuerySort] = useState('');

  const debouncedSetSearch = useRef(
    debounce(
      (v: string) => {
        setQuerySearch(v);
        setPage(0);
      },
      { wait: 300 },
    ),
  ).current;

  const handleSearchChange = useCallback(
    (v: string) => {
      setSearchText(v);
      debouncedSetSearch(v);
    },
    [debouncedSetSearch],
  );

  const handleSortChange = useCallback((v: string) => {
    setSortStr(v);
    setQuerySort(v);
    setPage(0);
  }, []);

  const toggleSortField = useCallback((field: string | null) => {
    if (!field) return;
    setSortStr((prev) => {
      try {
        const parsed = JSON.parse(prev);
        if (typeof parsed === 'object' && !Array.isArray(parsed) && Object.keys(parsed)[0] === field) {
          const dir = Object.values(parsed)[0];
          if (dir === 1) {
            const next = JSON.stringify({ [field]: -1 });
            setQuerySort(next);
            return next;
          }
          if (dir === -1) {
            setQuerySort('');
            return '';
          }
        }
      } catch {}
      const next = JSON.stringify({ [field]: 1 });
      setQuerySort(next);
      return next;
    });
    setPage(0);
  }, []);

  const { data: statsData, isLoading: statsLoading } = useMongoCollectionStats(connectionId, database, collection);

  const sortParsed = useMemo(() => {
    const parsed = parseJsonSafe(querySort);
    if (!parsed) return undefined;
    if (typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
    return Object.values(parsed).every((v) => v === 1 || v === -1) ? (parsed as Record<string, 1 | -1>) : undefined;
  }, [querySort]);

  const skip = page * pageLimit;
  const { data, isLoading, error, isFetching, refetch } = useMongoDocuments(
    connectionId,
    database,
    collection,
    {},
    sortParsed ?? {},
    pageLimit,
    skip,
    querySearch || undefined,
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
        queryClient.invalidateQueries({ queryKey: ['mongo-documents', connectionId, database, collection] });
      } catch (err) {
        alert(`Delete failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    },
    [connectionId, collection, database, queryClient],
  );

  const currentSortLabel = useMemo(() => {
    try {
      const parsed = JSON.parse(sortStr);
      const entry = Object.entries(parsed)[0];
      if (entry && (entry[1] === 1 || entry[1] === -1)) {
        return `${entry[0]} ${entry[1] === 1 ? '↑' : '↓'}`;
      }
    } catch {}
    return null;
  }, [sortStr]);

  const currentSortField = useMemo(() => {
    try {
      const parsed = JSON.parse(sortStr);
      const entry = Object.entries(parsed)[0];
      if (entry && (entry[1] === 1 || entry[1] === -1)) return entry[0];
    } catch {}
    return '';
  }, [sortStr]);

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="px-4 py-2 border-b border-border">
        <div className="flex items-center gap-2 mb-2">
          <Badge variant="outline" className="text-xs font-mono">
            {database}
          </Badge>
          <span className="text-muted-foreground">/</span>
          <span className="font-medium font-mono">{collection}</span>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap gap-1.5 items-end">
          <div className="flex-1 min-w-48">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
              <Input
                value={searchText}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Search all fields..."
                className="h-7 pl-7 text-xs"
              />
            </div>
          </div>
          <div className="flex items-end gap-1 self-end">
            <div className="flex items-center gap-1">
              <Select value={currentSortField} onValueChange={toggleSortField}>
                <SelectTrigger className="h-7 w-28 text-xs gap-1.5 px-2">
                  <ArrowUpDown className="size-3.5 text-muted-foreground" />
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  {data?.documents[0] &&
                    Object.keys(data.documents[0]).map((field) => (
                      <SelectItem key={field} value={field} className="text-xs">
                        {field}
                      </SelectItem>
                    ))}
                  <div className="border-t border-border my-1" />
                  <div className="px-2 py-1 text-[10px] text-muted-foreground">Click again to toggle direction</div>
                </SelectContent>
              </Select>
              {currentSortLabel && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleSortChange('')}
                  className="h-7 w-7"
                  title="Clear sort"
                >
                  <X className="size-3" />
                </Button>
              )}
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setViewMode('list')}
              className={viewMode === 'list' ? 'bg-muted' : ''}
              title="List view"
            >
              <List className="!size-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setViewMode('table')}
              className={viewMode === 'table' ? 'bg-muted' : ''}
              title="Table view"
            >
              <Table2 className="!size-3.5" />
            </Button>
            <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isFetching} title="Refresh">
              <RefreshCw className={`!size-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex items-center justify-center rounded-lg border border-input bg-background hover:bg-muted hover:text-foreground size-8">
                <Download className="size-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleExportJSON}>
                  <FileJson className="size-3.5 mr-2" />
                  Export JSON
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportCSV}>
                  <FileSpreadsheet className="size-3.5 mr-2" />
                  Export CSV
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as 'data' | 'stats')}
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
          {/* Documents */}
          <div className="p-4">
            {isLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <div className="flex items-center justify-center h-32 text-destructive">
                <AlertCircle className="size-5 mr-2" />
                {error instanceof Error ? error.message : 'Failed to load documents'}
              </div>
            ) : viewMode === 'table' ? (
              <div className="overflow-auto border rounded-md">
                {!data?.documents.length ? (
                  <div className="flex items-center justify-center h-32 text-muted-foreground">No documents found</div>
                ) : (
                  <DocumentTableView
                    documents={data.documents}
                    connectionId={connectionId}
                    collection={collection}
                    database={database}
                    onDelete={handleDeleteDocument}
                    onUpdate={() =>
                      queryClient.invalidateQueries({
                        queryKey: ['mongo-documents', connectionId, database, collection],
                      })
                    }
                    sortStr={sortStr}
                    onSortChange={toggleSortField}
                  />
                )}
                {data && (
                  <div className="px-3 py-1.5 text-xs text-muted-foreground border-t bg-muted/30 flex items-center gap-3">
                    <span>{data.documents.length} rows</span>
                    <span className="ml-auto">{data.durationMs}ms</span>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <span>Page</span>
                        <Input
                          type="number"
                          min={1}
                          value={page + 1}
                          onChange={(e) => {
                            const p = parseInt(e.target.value, 10);
                            if (!isNaN(p) && p >= 1) {
                              const maxPage = Math.max(0, Math.ceil(data.totalCount / pageLimit) - 1);
                              setPage(Math.min(p - 1, maxPage));
                            }
                          }}
                          className="h-7 w-14 text-xs text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={page === 0}
                          onClick={() => setPage((p) => Math.max(0, p - 1))}
                        >
                          <ChevronLeft className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={!data.hasMore}
                          onClick={() => setPage((p) => p + 1)}
                        >
                          <ChevronRight className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger className="inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-xs font-medium whitespace-nowrap transition-all outline-none select-none h-7 gap-1 hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50 px-2.5 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5">
                        <Download className="size-3" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={handleExportJSON}>Export as JSON</DropdownMenuItem>
                        <DropdownMenuItem onClick={handleExportCSV}>Export as CSV</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </div>
            ) : (
              <>
                {!data?.documents.length ? (
                  <div className="flex items-center justify-center h-32 text-muted-foreground">No documents found</div>
                ) : (
                  <>
                    <div className="text-xs text-muted-foreground mb-2 flex items-center justify-between">
                      <span>
                        {data.documents.length} document{data.documents.length !== 1 ? 's' : ''} returned
                        {data.hasMore && <span className="text-muted-foreground ml-1">(has more)</span>}
                      </span>
                      {isFetching && (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Loader2 className="size-3 animate-spin" />
                          Loading...
                        </span>
                      )}
                    </div>
                    <div className="space-y-2" role="list">
                      {data.documents.map((doc: Record<string, unknown>, index: number) => (
                        <DocumentCard
                          key={doc._id ? String(doc._id) : index}
                          doc={doc}
                          isExpanded={expandedDocs.has(index)}
                          onToggle={() => toggleDoc(index)}
                          onDelete={() => handleDeleteDocument(doc)}
                          onUpdate={() =>
                            queryClient.invalidateQueries({
                              queryKey: ['mongo-documents', connectionId, database, collection],
                            })
                          }
                          connectionId={connectionId}
                          collection={collection}
                          database={database}
                          tabIndex={0}
                        />
                      ))}
                    </div>
                  </>
                )}
                {data && (
                  <div className="px-3 py-1.5 text-xs text-muted-foreground border-t bg-muted/30 flex items-center gap-3 mt-2">
                    <span>{data.documents.length} rows</span>
                    <span className="ml-auto">{data.durationMs}ms</span>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <span>Page</span>
                        <Input
                          type="number"
                          min={1}
                          value={page + 1}
                          onChange={(e) => {
                            const p = parseInt(e.target.value, 10);
                            if (!isNaN(p) && p >= 1) {
                              const maxPage = Math.max(0, Math.ceil(data.totalCount / pageLimit) - 1);
                              setPage(Math.min(p - 1, maxPage));
                            }
                          }}
                          className="h-7 w-14 text-xs text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={page === 0}
                          onClick={() => setPage((p) => Math.max(0, p - 1))}
                        >
                          <ChevronLeft className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={!data.hasMore}
                          onClick={() => setPage((p) => p + 1)}
                        >
                          <ChevronRight className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger className="inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-xs font-medium whitespace-nowrap transition-all outline-none select-none h-7 gap-1 hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50 px-2.5 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5">
                        <Download className="size-3" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={handleExportJSON}>Export as JSON</DropdownMenuItem>
                        <DropdownMenuItem onClick={handleExportCSV}>Export as CSV</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </>
            )}
          </div>
        </TabsContent>

        <TabsContent value="stats" className="flex-1 overflow-auto p-4">
          {statsLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : statsData ? (
            <div className="space-y-4">
              <div className="border rounded-md">
                <div className="px-3 py-2 bg-muted/50 border-b font-medium text-sm">Overview</div>
                <div className="p-3">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-muted-foreground text-xs">Document Count</div>
                      <div className="font-mono text-lg">{statsData.documentCount.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">Indexes</div>
                      <div className="font-mono text-lg">{statsData.indexes.length}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border rounded-md">
                <div className="px-3 py-2 bg-muted/50 border-b font-medium text-sm">Indexes</div>
                <div className="divide-y">
                  {statsData.indexes.map((idx) => (
                    <div key={idx.name} className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm">{idx.name}</span>
                        {idx.unique && (
                          <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">Unique</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono mt-1">{JSON.stringify(idx.key)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-32 text-muted-foreground">No stats available</div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface DocumentCardProps {
  doc: Record<string, unknown>;
  isExpanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onUpdate: () => void;
  connectionId: string;
  collection: string;
  database: string;
  tabIndex?: number;
}

function DocumentCard({
  doc,
  isExpanded,
  onToggle,
  onDelete,
  onUpdate,
  connectionId,
  collection,
  database,
  tabIndex,
}: DocumentCardProps) {
  const [copied, setCopied] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);

  const handleCopy = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(JSON.stringify(doc, null, 2));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // clipboard not available
      }
    },
    [doc],
  );

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDelete();
    },
    [onDelete],
  );

  const startEdit = useCallback((key: string, value: unknown) => {
    setEditingKey(key);
    setEditValue(value === null ? 'null' : JSON.stringify(value));
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingKey(null);
    setEditValue('');
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editingKey || !doc._id) return;
    setSaving(true);
    try {
      let parsedValue: unknown;
      if (editValue === 'null') {
        parsedValue = null;
      } else {
        try {
          parsedValue = JSON.parse(editValue);
        } catch {
          parsedValue = editValue;
        }
      }
      await api.updateMongoDocument(connectionId, {
        collection,
        database,
        filter: { _id: doc._id },
        update: { [editingKey]: parsedValue },
      });
      setEditingKey(null);
      setEditValue('');
      onUpdate();
    } catch (err) {
      alert(`Update failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  }, [editingKey, editValue, doc._id, connectionId, collection, database, onUpdate]);

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        saveEdit();
      } else if (e.key === 'Escape') {
        cancelEdit();
      }
    },
    [saveEdit, cancelEdit],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onToggle();
      }
    },
    [onToggle],
  );

  return (
    <div className="border border-border rounded-md overflow-hidden" role="listitem">
      <Button
        variant="ghost"
        onClick={onToggle}
        onKeyDown={handleKeyDown}
        className="w-full font-normal"
        tabIndex={tabIndex}
        aria-expanded={isExpanded}
      >
        {isExpanded ? (
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="text-xs font-mono truncate flex-1">
          {doc._id ? (
            <span className="text-primary">_id</span>
          ) : (
            <span className="text-muted-foreground italic">no _id</span>
          )}
          {': '}
          <span className="text-foreground">{formatValue(doc._id)}</span>
        </span>
      </Button>
      {isExpanded && (
        <div className="px-2 py-1 border-t border-border bg-background relative group">
          <div className="absolute top-2 right-2 flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDelete}
              className="bg-muted/80 hover:bg-destructive/20 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100"
              title="Delete document"
            >
              <Trash2 className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCopy}
              className="bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100"
              title="Copy JSON"
            >
              {copied ? <Check className="size-3.5 text-primary" /> : <Copy className="size-3.5" />}
            </Button>
          </div>
          <div className="space-y-1 pr-24">
            {Object.entries(doc).map(([key, value]) => (
              <div key={key} className="flex items-start gap-2">
                <span className="text-xs font-mono text-primary shrink-0 min-w-24 truncate" title={key}>
                  {key}:
                </span>
                {editingKey === key ? (
                  <div className="flex items-center gap-1 flex-1 min-w-0">
                    <Input
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={handleEditKeyDown}
                      className="flex-1 min-w-0 h-6 px-1 text-xs font-mono border rounded focus:outline-none focus:ring-1 focus:ring-primary bg-background shrink-0"
                      autoFocus
                    />
                    <Button variant="ghost" size="icon" onClick={saveEdit} disabled={saving} title="Save (Enter)">
                      <Save className="size-3" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={cancelEdit} title="Cancel (Esc)">
                      <X className="size-3" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => startEdit(key, value)}
                    className="flex-1 font-normal truncate"
                    title={String(value)}
                  >
                    {value === null ? (
                      <span className="text-muted-foreground italic">null</span>
                    ) : typeof value === 'object' ? (
                      <span className="text-primary">{JSON.stringify(value)}</span>
                    ) : (
                      String(value)
                    )}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function formatValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return `"${value.length > 50 ? value.slice(0, 50) + '...' : value}"`;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

interface DocumentTableViewProps {
  documents: Record<string, unknown>[];
  connectionId: string;
  collection: string;
  database: string;
  onDelete: (doc: Record<string, unknown>) => void;
  onUpdate: () => void;
  sortStr: string;
  onSortChange: (field: string) => void;
}

function DocumentTableView({
  documents,
  connectionId,
  collection,
  database,
  onDelete,
  onUpdate,
  sortStr,
  onSortChange,
}: DocumentTableViewProps) {
  const [editCell, setEditCell] = useState<{ row: number; key: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [copiedRow, setCopiedRow] = useState<number | null>(null);

  const columns = useMemo(() => {
    const keys = new Set<string>();
    documents.forEach((doc) => Object.keys(doc).forEach((k) => keys.add(k)));
    return Array.from(keys);
  }, [documents]);

  const currentSort = useMemo(() => {
    try {
      const parsed = JSON.parse(sortStr);
      if (typeof parsed === 'object' && !Array.isArray(parsed)) {
        const entry = Object.entries(parsed)[0];
        if (entry && (entry[1] === 1 || entry[1] === -1)) {
          return { field: entry[0], dir: entry[1] as 1 | -1 };
        }
      }
    } catch {}
    return null;
  }, [sortStr]);

  const startEdit = useCallback((row: number, key: string, currentValue: unknown) => {
    setEditCell({ row, key });
    setEditValue(currentValue === null ? 'null' : JSON.stringify(currentValue));
  }, []);

  const cancelEdit = useCallback(() => {
    setEditCell(null);
    setEditValue('');
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editCell) return;
    const doc = documents[editCell.row];
    if (!doc._id) return;

    setSaving(true);
    try {
      let parsedValue: unknown;
      if (editValue === 'null') {
        parsedValue = null;
      } else {
        try {
          parsedValue = JSON.parse(editValue);
        } catch {
          parsedValue = editValue;
        }
      }
      await api.updateMongoDocument(connectionId, {
        collection,
        database,
        filter: { _id: doc._id },
        update: { [editCell.key]: parsedValue },
      });
      setEditCell(null);
      setEditValue('');
      onUpdate();
    } catch (err) {
      alert(`Update failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  }, [editCell, editValue, documents, connectionId, collection, database, onUpdate]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        saveEdit();
      } else if (e.key === 'Escape') {
        cancelEdit();
      }
    },
    [saveEdit, cancelEdit],
  );

  const formatCellValue = (value: unknown): string => {
    if (value === null) return 'null';
    if (value === undefined) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  const handleCopyRow = async (doc: Record<string, unknown>, rowIndex: number) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(doc, null, 2));
      setCopiedRow(rowIndex);
      setTimeout(() => setCopiedRow(null), 2000);
    } catch {
      // clipboard not available
    }
  };

  const tableColumns: ColumnDef<Record<string, unknown>>[] = columns.map((col) => ({
    id: col,
    header: col,
    accessor: (row) => row[col],
    sortable: true,
    cellClassName: 'px-1 overflow-hidden',
    render: (value, _row, rowIndex) => {
      const isEditing = editCell?.row === rowIndex && editCell?.key === col;
      if (isEditing) {
        return (
          <div className="flex items-end gap-0.5 min-w-0">
            <Input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 min-w-0 h-6 px-1 text-xs font-mono border rounded focus:outline-none focus:ring-1 focus:ring-primary bg-background shrink-0"
              autoFocus
            />
            <Button variant="ghost" size="icon" onClick={saveEdit} disabled={saving} title="Save (Enter)">
              <Save className="size-3" />
            </Button>
            <Button variant="ghost" size="icon" onClick={cancelEdit} title="Cancel (Esc)">
              <X className="size-3" />
            </Button>
          </div>
        );
      }
      return (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => startEdit(rowIndex, col, value)}
          className="w-full font-normal truncate block"
          title={formatCellValue(value)}
        >
          {value === null ? (
            <span className="text-muted-foreground italic">null</span>
          ) : (
            <span className={typeof value === 'object' ? 'text-primary' : ''}>{formatCellValue(value)}</span>
          )}
        </Button>
      );
    },
  }));

  return (
    <DataTable
      rows={documents}
      columns={tableColumns}
      rowKey={(doc, i) => (doc._id ? String(doc._id) : String(i))}
      showIndex
      onSortChange={onSortChange}
      sortColumn={currentSort?.field}
      sortDirection={currentSort?.dir === -1 ? 'desc' : 'asc'}
      suffix={(doc, rowIndex) => (
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" onClick={() => handleCopyRow(doc, rowIndex)} title="Copy JSON">
            {copiedRow === rowIndex ? <Check className="size-3 text-primary" /> : <Copy className="size-3" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDelete(doc)}
            className="hover:bg-destructive/20 hover:text-destructive"
            title="Delete document"
          >
            <Trash2 className="size-3" />
          </Button>
        </div>
      )}
      className="bg-background"
    />
  );
}
