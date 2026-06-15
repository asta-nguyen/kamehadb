import { useCallback, useMemo, useState } from 'react';
import { Copy, Eye, Save, X, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DataTable, type ColumnDef } from '@/components/data-table';
import { api } from '@/lib/api';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { RecordDetailTabs } from '@/components/table-view';
import { collectRecordFields, useFieldVisibility } from '@/hooks/use-field-visibility';

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
  const [selectedRow, setSelectedRow] = useState<Record<string, unknown> | null>(null);
  const columns = useMemo(() => collectRecordFields(documents), [documents]);
  const { visibleFields } = useFieldVisibility(columns, `${connectionId}:${database}:${collection}`);

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

  const handleCopyRow = async (doc: Record<string, unknown>) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(doc, null, 2));
    } catch {
      // clipboard not available
    }
  };

  const tableColumns: ColumnDef<Record<string, unknown>>[] = useMemo(
    () =>
      visibleFields.map((col) => ({
        id: col,
        header: col,
        accessor: (row) => row[col],
        sortable: true,
        cellClassName: 'px-1 overflow-hidden',
        render: (value, _row, rowIndex) => {
          const isEditing = editCell?.row === rowIndex && editCell?.key === col;
          if (isEditing) {
            return (
              <div className="flex min-w-0 items-end gap-0.5">
                <Input
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="h-6 min-w-0 flex-1 shrink-0 rounded border bg-background px-1 font-mono text-xs focus:ring-1 focus:ring-primary"
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
              className="block w-full truncate justify-start font-normal text-left"
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
      })),
    [visibleFields, editCell, editValue, handleKeyDown, saveEdit, saving, cancelEdit, startEdit],
  );

  return (
    <>
      <div>
        <DataTable
          rows={documents}
          columns={tableColumns}
          rowKey={(doc, i) => (doc._id ? String(doc._id) : String(i))}
          prefixHeader="Actions"
          prefixWidth="56px"
          prefixCellClassName="bg-background"
          showIndex
          onSortChange={onSortChange}
          sortColumn={currentSort?.field}
          sortDirection={currentSort?.dir === -1 ? 'desc' : 'asc'}
          prefix={(doc) => (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="size-3.5">
                  <path d="M8 2a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM8 6.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM9.5 12.5a1.5 1.5 0 1 0-3 0 1.5 1.5 0 0 0 3 0Z" />
                </svg>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onClick={() => setSelectedRow(doc)}>
                  <Eye className="size-3.5 mr-2" />
                  View details
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleCopyRow(doc)}>
                  <Copy className="size-3.5 mr-2" />
                  Copy JSON
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onDelete(doc)}>
                  <Trash2 className="size-3.5 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          className="bg-background"
        />
      </div>

      <Sheet open={!!selectedRow} onOpenChange={(open) => !open && setSelectedRow(null)}>
        <SheetContent className="flex flex-col sm:max-w-lg">
          <SheetHeader className="shrink-0">
            <SheetTitle className="flex items-center gap-2">
              <Eye className="size-4" />
              Document details
            </SheetTitle>
          </SheetHeader>
          <RecordDetailTabs selectedRow={selectedRow} />
        </SheetContent>
      </Sheet>
    </>
  );
}
