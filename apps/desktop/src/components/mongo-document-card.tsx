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
    <li className="border border-border rounded-md overflow-hidden">
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
