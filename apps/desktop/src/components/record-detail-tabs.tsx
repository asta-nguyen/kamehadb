import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DatePicker } from '@/components/ui/date-picker';
import { Check, Copy, Eye, FileJson, Save } from 'lucide-react';
import { formatJsonSyntax } from '@/lib/utils.tsx';
import { toast } from 'sonner';

export type EditableColumn = {
  readonly name: string;
  readonly type: string;
  readonly isJson?: boolean;
};

export function RecordDetailTabs({
  selectedRow,
  editableColumns,
  onSaveField,
  canEdit,
}: {
  selectedRow: Record<string, unknown> | null;
  /** When provided alongside canEdit + onSaveField, fields become editable inline. */
  editableColumns?: readonly EditableColumn[];
  /** Called once per changed field when the user clicks Save. Returning a
   *  Promise<boolean> lets the caller await completion and report per-field
   *  success/failure; a sync boolean is also accepted. */
  onSaveField?: (key: string, newValue: string) => Promise<boolean> | boolean;
  /** Gate for whether inline editing is enabled. */
  canEdit?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});

  // Reset edit state whenever the selected row changes so stale edits from
  // a previous record don't leak into the new one.
  useEffect(() => {
    setEdits({});
  }, [selectedRow]);

  const handleCopy = useCallback(async () => {
    if (!selectedRow) return;
    await navigator.clipboard.writeText(JSON.stringify(selectedRow, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [selectedRow]);

  const handleCopyField = useCallback(async (key: string, value: unknown) => {
    const text = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
    await navigator.clipboard.writeText(text);
    setCopiedField(key);
    setTimeout(() => setCopiedField(null), 1500);
  }, []);

  const json = useMemo(() => JSON.stringify(selectedRow ?? {}, null, 2), [selectedRow]);

  const isEditable = canEdit && !!onSaveField && !!editableColumns;

  const columnMap = useMemo(() => {
    const m = new Map<string, EditableColumn>();
    editableColumns?.forEach((c) => m.set(c.name, c));
    return m;
  }, [editableColumns]);

  const formatEditDefault = useCallback(
    (key: string, value: unknown): string => {
      if (value === null || value === undefined) return '';
      const col = columnMap.get(key);
      const type = col?.type?.toLowerCase() ?? '';
      const isJson = col?.isJson || type === 'json' || type === 'jsonb';
      if (isJson) {
        if (typeof value === 'object') return JSON.stringify(value, null, 2);
        const s = String(value);
        try {
          return JSON.stringify(JSON.parse(s), null, 2);
        } catch {
          return s;
        }
      }
      const s = String(value);
      if (type === 'date' && s.includes('T')) return s.slice(0, 10);
      // Timestamps keep their full precision (seconds, fractional seconds,
      // timezone suffix) so editing doesn't silently discard sub-minute detail.
      return s;
    },
    [columnMap],
  );

  const changedKeys = useMemo(
    () =>
      Object.keys(edits).filter((key) => {
        if (!selectedRow) return false;
        const original = formatEditDefault(key, selectedRow[key]);
        return edits[key] !== original;
      }),
    [edits, selectedRow, formatEditDefault],
  );

  const hasChanges = changedKeys.length > 0;

  const handleSave = useCallback(async () => {
    if (!onSaveField || !selectedRow || changedKeys.length === 0) return;
    // Validate JSON fields before saving.
    for (const key of changedKeys) {
      const col = columnMap.get(key);
      const type = col?.type?.toLowerCase() ?? '';
      const isJson = col?.isJson || type === 'json' || type === 'jsonb';
      if (isJson && edits[key] !== '') {
        try {
          JSON.parse(edits[key]);
        } catch (err) {
          toast.error(`Invalid JSON in "${key}"`, { description: (err as Error).message });
          return;
        }
      }
    }
    // Await every update so a failure is reported accurately instead of being
    // masked by a premature success toast. Only clear edits when all succeed.
    const results = await Promise.all(changedKeys.map((key) => onSaveField(key, edits[key])));
    const failedCount = results.filter((ok) => ok === false).length;
    if (failedCount === 0) {
      setEdits({});
      toast.success(`Saved ${changedKeys.length} field${changedKeys.length > 1 ? 's' : ''}`);
    } else {
      toast.error(`Failed to save ${failedCount} field${failedCount > 1 ? 's' : ''}`);
    }
  }, [onSaveField, selectedRow, changedKeys, edits, columnMap]);

  if (!selectedRow) return null;

  return (
    <Tabs defaultValue="view" className="flex-1 flex flex-col min-h-0">
      <div className="shrink-0 px-4 pb-2">
        <TabsList>
          <TabsTrigger value="view" className="text-xs">
            <Eye className="size-3 mr-1" />
            View
          </TabsTrigger>
          <TabsTrigger value="json" className="text-xs">
            <FileJson className="size-3 mr-1" />
            JSON
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="view" className="flex-1 min-h-0 p-0">
        <div className="h-full overflow-y-auto">
          <div className="pb-2">
            {Object.entries(selectedRow).map(([key, value], i) => {
              const typeLabel = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
              const col = columnMap.get(key);
              const lowerType = col?.type?.toLowerCase() ?? '';
              const isJson = col?.isJson || lowerType === 'json' || lowerType === 'jsonb';
              const isDate = lowerType === 'date';
              const isTimestamp = lowerType.includes('timestamp') || lowerType === 'datetime';
              const fieldEditable = isEditable && !!col;
              const currentValue = fieldEditable ? (edits[key] ?? formatEditDefault(key, value)) : '';

              return (
                <div key={key} className={`flex items-start gap-3 px-4 py-2 ${i % 2 === 0 ? 'bg-muted/20' : ''}`}>
                  <div className="w-2/5 shrink-0 min-w-0">
                    <div className="text-xs font-medium truncate">{key}</div>
                    <span className="text-xs uppercase text-muted-foreground/50 tracking-wider">{typeLabel}</span>
                  </div>
                  <div className="flex-1 min-w-0 text-sm font-mono break-all leading-snug group/field">
                    {fieldEditable ? (
                      isJson ? (
                        <Textarea
                          value={currentValue}
                          onChange={(e) => setEdits((prev) => ({ ...prev, [key]: e.target.value }))}
                          className="text-xs font-mono min-h-20 resize-y"
                          placeholder="{} or null"
                        />
                      ) : isDate || isTimestamp ? (
                        <DatePicker
                          value={currentValue}
                          onChange={(v) => {
                            if (isTimestamp) {
                              const original = selectedRow[key] != null ? String(selectedRow[key]) : '';
                              // The datetime picker writes minute precision
                              // (YYYY-MM-DDTHH:mm). Re-append the original
                              // seconds/fractional/timezone suffix so a date
                              // change via the calendar doesn't silently
                              // discard precision.
                              if (v.length === 16 && original.length > 16 && original.includes('T')) {
                                v = v + original.slice(16);
                              }
                            }
                            setEdits((prev) => ({ ...prev, [key]: v }));
                          }}
                          mode={isTimestamp ? 'datetime' : 'date'}
                          className="w-full"
                        />
                      ) : (
                        <Input
                          type="text"
                          value={currentValue}
                          onChange={(e) => setEdits((prev) => ({ ...prev, [key]: e.target.value }))}
                          className="h-8 text-xs font-mono"
                        />
                      )
                    ) : (
                      <>
                        {value === null ? (
                          <span className="text-muted-foreground italic">null</span>
                        ) : typeof value === 'object' ? (
                          <pre className="text-xs whitespace-pre-wrap bg-muted/50 rounded p-2 mt-0.5 max-h-32 overflow-auto">
                            {JSON.stringify(value, null, 2)}
                          </pre>
                        ) : (
                          <span className="text-foreground/90">{String(value)}</span>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleCopyField(key, value)}
                          className="size-5 rounded opacity-0 group-hover/field:opacity-100 transition-opacity ml-1 align-middle hover:bg-muted-foreground/20"
                          title="Copy value"
                        >
                          {copiedField === key ? (
                            <Check className="size-3 text-primary" />
                          ) : (
                            <Copy className="size-3 text-muted-foreground" />
                          )}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {isEditable && hasChanges && (
            <div className="sticky bottom-0 px-4 py-3 bg-background border-t border-border">
              <Button onClick={handleSave} size="sm" className="w-full">
                <Save className="size-3.5 mr-1.5" />
                Save {changedKeys.length} change{changedKeys.length > 1 ? 's' : ''}
              </Button>
            </div>
          )}
        </div>
      </TabsContent>

      <TabsContent value="json" className="flex-1 min-h-0 p-0">
        <div className="relative h-full overflow-y-auto">
          <Button variant="outline" size="icon-sm" className="absolute top-2 right-2 z-10" onClick={handleCopy}>
            {copied ? <Check className="size-3.5 text-primary" /> : <Copy className="size-3.5" />}
          </Button>
          <pre className="p-3 font-mono text-xs leading-relaxed bg-card text-muted-foreground rounded-sm m-2 overflow-auto">
            {formatJsonSyntax(json)}
          </pre>
        </div>
      </TabsContent>
    </Tabs>
  );
}
