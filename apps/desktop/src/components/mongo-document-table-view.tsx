import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Check, Eye, Save, X, Trash2, Columns3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DataTable, type ColumnDef } from '@/components/data-table';
import { api } from '@/lib/api';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuShortcut,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { RecordDetailTabs } from '@/components/table-view';

function formatCellValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function areStringListsEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
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
  const [selectedRow, setSelectedRow] = useState<Record<string, unknown> | null>(null);
  const [visibleFields, setVisibleFields] = useState<string[]>([]);

  const columns = useMemo(() => {
    const keys = new Set<string>();
    documents.forEach((doc) => Object.keys(doc).forEach((k) => keys.add(k)));
    return Array.from(keys);
  }, [documents]);

  // Keep the field picker stable across data refreshes while dropping fields
  // that no longer exist. On first load, default to showing every field.
  useEffect(() => {
    setVisibleFields((prev) => {
      if (columns.length === 0) return [];
      if (prev.length === 0) return columns;
      const next = prev.filter((field) => columns.includes(field));
      const resolved = next.length > 0 ? next : columns;
      return areStringListsEqual(prev, resolved) ? prev : resolved;
    });
  }, [columns]);

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

  // Never let the field picker hide the final visible column; an empty grid is
  // more confusing than a dense one, so the last field stays pinned on.
  const toggleFieldVisibility = useCallback(
    (field: string, nextChecked: boolean) => {
      setVisibleFields((prev) => {
        if (nextChecked) {
          return columns.filter((column) => column === field || prev.includes(column));
        }
        if (prev.length <= 1) return prev;
        return prev.filter((column) => column !== field);
      });
    },
    [columns],
  );

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
      <div className="flex items-center justify-between gap-3 border-b bg-muted/20 px-3 py-2">
        <div className="text-xs text-muted-foreground">
          Showing {visibleFields.length} of {columns.length} fields
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="gap-1.5" />}>
            <Columns3 className="size-3.5" />
            Fields
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Visible fields</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {columns.map((field) => {
                const checked = visibleFields.includes(field);
                return (
                  <DropdownMenuItem key={field} onClick={() => toggleFieldVisibility(field, !checked)}>
                    <span className="truncate" title={field}>
                      {field}
                    </span>
                    <DropdownMenuShortcut>{checked ? <Check className="size-3.5" /> : null}</DropdownMenuShortcut>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="overflow-x-auto">
        <DataTable
          rows={documents}
          columns={tableColumns}
          rowKey={(doc, i) => (doc._id ? String(doc._id) : String(i))}
          showIndex
          onSortChange={onSortChange}
          sortColumn={currentSort?.field}
          sortDirection={currentSort?.dir === -1 ? 'desc' : 'asc'}
          suffixHeader="Actions"
          suffixWidth="120px"
          suffixHeaderClassName="sticky right-0 z-20 border-l border-border/50 bg-muted shadow-[-8px_0_12px_-12px_rgba(0,0,0,0.6)]"
          suffixCellClassName="sticky right-0 z-10 border-l border-border/30 bg-background shadow-[-8px_0_12px_-12px_rgba(0,0,0,0.45)]"
          suffix={(doc, rowIndex) => (
            <div className="flex items-center justify-end gap-0.5">
              <Button variant="ghost" size="icon" onClick={() => setSelectedRow(doc)} title="View details">
                <Eye className="size-3" />
              </Button>
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
          className="min-w-max bg-background"
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
