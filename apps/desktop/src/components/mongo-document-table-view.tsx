import { useCallback, useMemo, useRef, useState } from 'react';
import { Copy, Eye, Trash2, Ellipsis } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DataTable, type ColumnDef } from '@/components/data-table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { RecordDetailTabs } from '@/components/record-detail-tabs';
import { collectRecordFields, useFieldVisibility } from '@/hooks/use-field-visibility';
import { useMongoFieldEdit } from '@/hooks/use-mongo-field-edit';

function formatScalar(value: unknown): string {
  if (value === undefined) return '';
  return String(value);
}

function formatObjectPreview(value: unknown): string {
  if (Array.isArray(value)) return `[ ${value.length} item${value.length !== 1 ? 's' : ''} ]`;
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>);
    return `{ ${keys.length} field${keys.length !== 1 ? 's' : ''} }`;
  }
  return formatScalar(value);
}

interface DocumentTableViewProps {
  documents: Record<string, unknown>[];
  connectionId: number;
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
  const [editCell, setEditCell] = useState<{ docId: unknown; key: string } | null>(null);
  const [selectedRow, setSelectedRow] = useState<Record<string, unknown> | null>(null);

  // Distinguish single-click (open sheet) from double-click (edit cell).
  // event.detail >= 2 means a double-click — skip the sheet entirely.
  // A 300ms timeout as fallback handles edge cases where the browser
  // reports detail=1 for the first click of a slow double-click.
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { editValue, setEditValue, saving, startEditValue, clearEditValue, saveFieldEdit, handleEditKeyDown } =
    useMongoFieldEdit({
      connectionId,
      collection,
      database,
      onUpdate,
      logScope: 'mongo-document-table.update',
    });

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
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
    }
    return null;
  }, [sortStr]);

  const startEdit = useCallback(
    (docId: unknown, key: string, currentValue: unknown) => {
      setEditCell({ docId, key });
      startEditValue(currentValue);
    },
    [startEditValue],
  );

  const cancelEdit = useCallback(() => {
    setEditCell(null);
    clearEditValue();
  }, [clearEditValue]);

  const saveEdit = useCallback(async () => {
    if (!editCell) return;
    if (editCell.docId == null) return;
    const success = await saveFieldEdit(editCell.docId, editCell.key);
    if (success) {
      setEditCell(null);
      clearEditValue();
    }
  }, [editCell, saveFieldEdit, clearEditValue]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      handleEditKeyDown(e, saveEdit, cancelEdit);
    },
    [handleEditKeyDown, saveEdit, cancelEdit],
  );

  const handleCopyRow = async (doc: Record<string, unknown>) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(doc, null, 2));
    } catch (err) {
      // Clipboard write can fail from permissions or Tauri webview context;
      // non-critical so just log rather than alerting the user.
      console.warn('[Mongo] copy failed:', err);
    }
  };

  const handleRowClick = useCallback((doc: Record<string, unknown>, _index: number, e: React.MouseEvent) => {
    // If this is the second click of a double-click, don't open the sheet —
    // the cell-level onDoubleClick handler will start editing instead.
    if (e.detail >= 2) {
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
      }
      return;
    }
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    clickTimerRef.current = setTimeout(() => {
      setSelectedRow(doc);
      clickTimerRef.current = null;
    }, 300);
  }, []);

  const handleCellDoubleClick = useCallback(
    (docId: unknown, key: string, value: unknown) => {
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
      }
      startEdit(docId, key, value);
    },
    [startEdit],
  );

  const tableColumns: ColumnDef<Record<string, unknown>>[] = useMemo(
    () =>
      visibleFields.map((col) => ({
        id: col,
        header: col,
        accessor: (row) => row[col],
        sortable: true,
        cellClassName: col === '_id' ? 'font-mono text-xs text-muted-foreground' : undefined,
        render: (value, row) => {
          const isEditing = editCell?.docId === row?._id && editCell?.key === col;
          if (isEditing) {
            return (
              <Input
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={onKeyDown}
                onBlur={() => setTimeout(() => saveEdit(), 150)}
                className="h-7 min-w-0 text-xs"
                autoFocus
              />
            );
          }
          const isObject = value !== null && typeof value === 'object';
          const displayText = isObject ? formatObjectPreview(value) : formatScalar(value);
          return (
            <span
              onDoubleClick={() => handleCellDoubleClick(row?._id, col, value)}
              className="flex-1 min-w-0 truncate cursor-pointer"
            >
              {value === null ? (
                <span className="text-muted-foreground italic">{displayText}</span>
              ) : isObject ? (
                <span className="text-primary">{displayText}</span>
              ) : (
                <span>{displayText}</span>
              )}
            </span>
          );
        },
      })),
    [visibleFields, editCell, editValue, onKeyDown, saveEdit, saving, cancelEdit, startEdit, handleCellDoubleClick],
  );

  return (
    <>
      <DataTable
        rows={documents}
        columns={tableColumns}
        rowKey={(doc, i) => (doc._id ? String(doc._id) : String(i))}
        onRowClick={handleRowClick}
        suffixHeader="Actions"
        suffixWidth="64px"
        showIndex
        stickyHeader
        onSortChange={onSortChange}
        sortColumn={currentSort?.field}
        sortDirection={currentSort?.dir === -1 ? 'desc' : 'asc'}
        suffix={(doc) => (
          <div onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
                <Ellipsis className="size-3.5" />
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
          </div>
        )}
        className="bg-background"
      />

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
