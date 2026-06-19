import { useCallback, useState } from 'react';
import { ChevronDown, ChevronRight, Copy, Check, Trash2, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';

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

export function DocumentCard({
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
    <li className="border-border rounded-md border overflow-hidden">
      <Button
        variant="ghost"
        onClick={onToggle}
        onKeyDown={handleKeyDown}
        className="w-full font-normal"
        tabIndex={tabIndex}
        aria-expanded={isExpanded}
      >
        {isExpanded ? (
          <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
        )}
        <span className="flex-1 text-xs font-mono truncate">
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
        <div className="relative px-2 py-1 bg-background border-t border-border group">
          <div className="absolute top-2 right-2 flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDelete}
              className="text-muted-foreground bg-muted/80 opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/20"
              title="Delete document"
            >
              <Trash2 className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCopy}
              className="text-muted-foreground bg-muted/80 opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-muted"
              title="Copy JSON"
            >
              {copied ? <Check className="size-3.5 text-primary" /> : <Copy className="size-3.5" />}
            </Button>
          </div>
          <div className="pr-24 space-y-1">
            {Object.entries(doc).map(([key, value]) => (
              <div key={key} className="flex items-start gap-2">
                <span className="min-w-24 text-xs text-primary font-mono shrink-0 truncate" title={key}>
                  {key}:
                </span>
                {editingKey === key ? (
                  <div className="flex items-center flex-1 min-w-0 gap-1">
                    <Input
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={handleEditKeyDown}
                      className="flex-1 px-1 min-w-0 h-6 text-xs font-mono bg-background rounded-sm border shrink-0 focus:outline-hidden focus:ring-1 focus:ring-primary"
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
                    className="flex-1 justify-start text-left font-normal truncate"
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
    </li>
  );
}

function formatValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return `"${value.length > 50 ? value.slice(0, 50) + '...' : value}"`;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
