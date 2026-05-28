import { useState, useCallback, useEffect, useMemo } from 'react';
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
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  const [filterStr, setFilterStr] = useState('{}');
  const [sortStr, setSortStr] = useState('');
  const [limitStr, setLimitStr] = useState('100');
  const [debouncedFilter, setDebouncedFilter] = useState<Record<string, unknown>>({});
  const [debouncedSort, setDebouncedSort] = useState<Record<string, 1 | -1> | undefined>(undefined);
  const [debouncedLimit, setDebouncedLimit] = useState(100);

  const { data: statsData, isLoading: statsLoading } = useMongoCollectionStats(connectionId, database, collection);

  const filterValid = useMemo(() => parseJsonSafe(filterStr), [filterStr]);
  const sortValid = useMemo(() => parseJsonSafe(sortStr), [sortStr]);

  // Debounce filter/sort/limit changes
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedFilter(parseJsonSafe(filterStr) ?? {});
    }, 300);
    return () => clearTimeout(timer);
  }, [filterStr]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (sortStr) {
        const parsed = parseJsonSafe(sortStr);
        setDebouncedSort(parsed as Record<string, 1 | -1> | undefined);
      } else {
        setDebouncedSort(undefined);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [sortStr]);

  useEffect(() => {
    const val = parseInt(limitStr, 10);
    if (!isNaN(val) && val > 0) {
      setDebouncedLimit(Math.min(val, 10000));
    }
  }, [limitStr]);

  const { data, isLoading, error, isFetching, refetch } = useMongoDocuments(
    connectionId,
    database,
    collection,
    debouncedFilter,
    debouncedSort,
    debouncedLimit,
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

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 mb-3">
          <Badge variant="outline" className="text-xs font-mono">
            {database}
          </Badge>
          <span className="text-muted-foreground">/</span>
          <span className="font-medium font-mono">{collection}</span>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-64">
            <label className="text-xs text-muted-foreground mb-1 block">Filter (JSON)</label>
            <Input
              value={filterStr}
              onChange={(e) => setFilterStr(e.target.value)}
              placeholder='{"status": "active"}'
              className="h-8 text-xs font-mono"
            />
          </div>
          <div className="w-36">
            <label className="text-xs text-muted-foreground mb-1 block">Sort (JSON)</label>
            <Input
              value={sortStr}
              onChange={(e) => setSortStr(e.target.value)}
              placeholder='{"_id": 1}'
              className="h-8 text-xs font-mono"
            />
          </div>
          <div className="w-20">
            <label className="text-xs text-muted-foreground mb-1 block">Limit</label>
            <Input
              value={limitStr}
              onChange={(e) => setLimitStr(e.target.value)}
              type="number"
              min="1"
              max="10000"
              className="h-8 text-xs"
            />
          </div>
          <div className="flex items-end gap-1">
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

        {/* JSON validation */}
        {filterValid === null && filterStr !== '{}' && (
          <p className="text-xs text-destructive mt-1 flex items-center gap-1">
            <AlertCircle className="size-3" />
            Invalid JSON in filter
          </p>
        )}
        {sortStr && sortValid === null && (
          <p className="text-xs text-destructive mt-1 flex items-center gap-1">
            <AlertCircle className="size-3" />
            Invalid JSON in sort
          </p>
        )}
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

        <TabsContent value="data" className="flex-1 min-h-0">
          {/* Documents */}
          <div className="flex-1 overflow-auto p-4">
            {isLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <div className="flex items-center justify-center h-32 text-destructive">
                <AlertCircle className="size-5 mr-2" />
                {error instanceof Error ? error.message : 'Failed to load documents'}
              </div>
            ) : !data?.documents.length ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground">No documents found</div>
            ) : viewMode === 'table' ? (
              <DocumentTableView
                documents={data.documents}
                connectionId={connectionId}
                collection={collection}
                database={database}
                onDelete={handleDeleteDocument}
                onUpdate={() =>
                  queryClient.invalidateQueries({ queryKey: ['mongo-documents', connectionId, database, collection] })
                }
              />
            ) : (
              <>
                {/* Meta */}
                <div className="text-xs text-muted-foreground mb-3 flex items-center justify-between">
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

                {/* Document cards */}
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
      <button
        onClick={onToggle}
        onKeyDown={handleKeyDown}
        className="w-full flex items-center gap-2 px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors text-left focus:outline-none focus:ring-2 focus:ring-primary/50"
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
      </button>
      {isExpanded && (
        <div className="px-3 py-2 border-t border-border bg-background relative group">
          <div className="absolute top-2 right-2 flex items-center gap-1">
            <button
              onClick={handleDelete}
              className="p-1.5 rounded bg-muted/80 hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
              title="Delete document"
            >
              <Trash2 className="size-3.5" />
            </button>
            <button
              onClick={handleCopy}
              className="p-1.5 rounded bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
              title="Copy JSON"
            >
              {copied ? <Check className="size-3.5 text-primary" /> : <Copy className="size-3.5" />}
            </button>
          </div>
          <div className="space-y-1 pr-24">
            {Object.entries(doc).map(([key, value]) => (
              <div key={key} className="flex items-start gap-2">
                <span className="text-xs font-mono text-primary shrink-0 min-w-24 truncate" title={key}>
                  {key}:
                </span>
                {editingKey === key ? (
                  <div className="flex items-center gap-1 flex-1 min-w-0">
                    <input
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={handleEditKeyDown}
                      className="flex-1 min-w-0 h-6 px-1 text-xs font-mono border rounded focus:outline-none focus:ring-1 focus:ring-primary bg-background shrink-0"
                      autoFocus
                    />
                    <button
                      onClick={saveEdit}
                      disabled={saving}
                      className="p-1 hover:bg-muted rounded text-primary shrink-0"
                      title="Save (Enter)"
                    >
                      <Save className="size-3" />
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="p-1 hover:bg-muted rounded text-muted-foreground shrink-0"
                      title="Cancel (Esc)"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => startEdit(key, value)}
                    className="flex-1 text-left px-1 py-0.5 hover:bg-muted/50 rounded truncate text-xs font-mono"
                    title={String(value)}
                  >
                    {value === null ? (
                      <span className="text-muted-foreground italic">null</span>
                    ) : typeof value === 'object' ? (
                      <span className="text-primary">{JSON.stringify(value)}</span>
                    ) : (
                      String(value)
                    )}
                  </button>
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
}

function DocumentTableView({
  documents,
  connectionId,
  collection,
  database,
  onDelete,
  onUpdate,
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

  const tableMinWidth = 32 + columns.length * 120 + 80;

  return (
    <div className="border rounded-md overflow-auto bg-background">
      <table className="w-full text-xs table-fixed" style={{ minWidth: tableMinWidth }}>
        <thead className="sticky top-0 z-10 bg-muted/50">
          <tr>
            <th className="px-2 py-1.5 font-medium text-muted-foreground text-left" style={{ width: 32 }}>
              #
            </th>
            {columns.map((col) => (
              <th key={col} className="px-2 py-1.5 font-medium text-muted-foreground text-left" style={{ width: 120 }}>
                <span className="truncate block" title={col}>
                  {col}
                </span>
              </th>
            ))}
            <th className="px-2 py-1.5 font-medium text-muted-foreground text-left" style={{ width: 80 }}>
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {documents.map((doc, rowIndex) => (
            <tr
              key={doc._id ? String(doc._id) : rowIndex}
              className="border-b last:border-b-0 bg-background even:bg-muted/20 hover:bg-muted/30"
            >
              <td className="px-2 py-1.5 text-muted-foreground">{rowIndex + 1}</td>
              {columns.map((col) => {
                const value = doc[col];
                const isEditing = editCell?.row === rowIndex && editCell?.key === col;
                return (
                  <td key={col} className="px-1 py-1 overflow-hidden">
                    {isEditing ? (
                      <div className="flex items-end gap-0.5 min-w-0">
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={handleKeyDown}
                          className="flex-1 min-w-0 h-6 px-1 text-xs font-mono border rounded focus:outline-none focus:ring-1 focus:ring-primary bg-background shrink-0"
                          autoFocus
                        />
                        <button
                          onClick={saveEdit}
                          disabled={saving}
                          className="p-1 hover:bg-muted rounded text-primary shrink-0"
                          title="Save (Enter)"
                        >
                          <Save className="size-3" />
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="p-1 hover:bg-muted rounded text-muted-foreground shrink-0"
                          title="Cancel (Esc)"
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startEdit(rowIndex, col, value)}
                        className="w-full text-left px-1 py-0.5 hover:bg-muted/50 rounded truncate block"
                        title={formatCellValue(value)}
                      >
                        {value === null ? (
                          <span className="text-muted-foreground italic">null</span>
                        ) : (
                          <span className={typeof value === 'object' ? 'text-primary' : ''}>
                            {formatCellValue(value)}
                          </span>
                        )}
                      </button>
                    )}
                  </td>
                );
              })}
              <td className="px-1 py-1">
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => handleCopyRow(doc, rowIndex)}
                    className="p-1 hover:bg-muted rounded"
                    title="Copy JSON"
                  >
                    {copiedRow === rowIndex ? <Check className="size-3 text-primary" /> : <Copy className="size-3" />}
                  </button>
                  <button
                    onClick={() => onDelete(doc)}
                    className="p-1 hover:bg-destructive/20 rounded hover:text-destructive"
                    title="Delete document"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
