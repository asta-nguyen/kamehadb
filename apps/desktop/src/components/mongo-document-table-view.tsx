import { useCallback, useMemo, useState } from 'react';
import { Copy, Check, Save, X, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DataTable, type ColumnDef } from '@/components/data-table';
import { api } from '@/lib/api';

function formatCellValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return '';
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

export function DocumentTableView({
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
