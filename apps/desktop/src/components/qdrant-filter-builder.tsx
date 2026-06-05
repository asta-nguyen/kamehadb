import { useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, X } from 'lucide-react';

type Combinator = 'must' | 'should' | 'must_not';
type Op = 'eq' | 'gt' | 'gte' | 'lt' | 'lte';

interface Row {
  key: string;
  op: Op;
  value: string;
}

const COMBINATORS: { value: Combinator; label: string }[] = [
  { value: 'must', label: 'All' },
  { value: 'should', label: 'Any' },
  { value: 'must_not', label: 'None' },
];

const OPS: { value: Op; label: string }[] = [
  { value: 'eq', label: '=' },
  { value: 'gt', label: '>' },
  { value: 'gte', label: '≥' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '≤' },
];

// Coerce typed values: "true"/"false" → bool, numeric → number, else string.
function coerce(v: string): unknown {
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

function buildFilter(combinator: Combinator, rows: Row[]): Record<string, unknown> | undefined {
  const conditions: Record<string, unknown>[] = [];
  for (const r of rows) {
    if (!r.key.trim() || !r.value.trim()) continue;
    if (r.op === 'eq') {
      conditions.push({ key: r.key.trim(), match: { value: coerce(r.value) } });
      continue;
    }
    const parsed = Number(r.value);
    if (!Number.isFinite(parsed)) continue;
    conditions.push({ key: r.key.trim(), range: { [r.op]: parsed } });
  }
  if (conditions.length === 0) return undefined;
  return { [combinator]: conditions };
}

interface QdrantFilterBuilderProps {
  onChange: (filter: Record<string, unknown> | undefined) => void;
  fields?: string[];
}

export function QdrantFilterBuilder({ onChange, fields = [] }: QdrantFilterBuilderProps) {
  const [combinator, setCombinator] = useState<Combinator>('must');
  const [rows, setRows] = useState<Row[]>([]);
  const [advanced, setAdvanced] = useState(false);
  const [json, setJson] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const listId = useId();

  // Emit the built filter whenever the builder rows change (only in non-advanced mode).
  useEffect(() => {
    if (advanced) return;
    onChange(buildFilter(combinator, rows));
  }, [combinator, rows, advanced]);

  const updateRow = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, { key: '', op: 'eq', value: '' }]);
  const removeRow = (i: number) => setRows((rs) => rs.filter((_, idx) => idx !== i));

  const handleJson = (text: string) => {
    setJson(text);
    if (!text.trim()) {
      setJsonError(null);
      onChange(undefined);
      return;
    }
    try {
      onChange(JSON.parse(text));
      setJsonError(null);
    } catch {
      setJsonError('Invalid JSON');
      onChange(undefined);
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Filter</span>
        {!advanced && rows.length > 0 && (
          <Select value={combinator} onValueChange={(v) => setCombinator(v as Combinator)}>
            <SelectTrigger size="sm" title="Match" className="h-6 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COMBINATORS.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  Match {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button variant="ghost" size="sm" onClick={() => setAdvanced(!advanced)} className="ml-auto">
          {advanced ? 'Visual' : 'Advanced JSON'}
        </Button>
      </div>

      {advanced ? (
        <>
          <div className="relative">
            <Textarea
              value={json}
              onChange={(e) => handleJson(e.target.value)}
              placeholder='{ "must": [{ "key": "kind", "match": { "value": "fruit" } }] }'
              spellCheck={false}
              className="w-full min-h-16 px-2 py-1 text-xs font-mono bg-background border rounded resize-y focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
            {json && !jsonError && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  try {
                    handleJson(JSON.stringify(JSON.parse(json), null, 2));
                  } catch {}
                }}
                title="Format JSON"
              >
                {'{ }'}
              </Button>
            )}
          </div>
          {jsonError && <div className="text-xs text-destructive">{jsonError}</div>}
        </>
      ) : (
        <>
          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <Input
                value={row.key}
                onChange={(e) => updateRow(i, { key: e.target.value })}
                placeholder="field"
                list={fields.length ? listId : undefined}
                className="flex-1 h-7 px-2 text-xs font-mono bg-background border rounded focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
              <Select value={row.op} onValueChange={(v) => updateRow(i, { op: v as Op })}>
                <SelectTrigger size="sm" className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={row.value}
                onChange={(e) => updateRow(i, { value: e.target.value })}
                placeholder="value"
                className="flex-1 h-7 px-2 text-xs font-mono bg-background border rounded focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
              <Button variant="ghost" size="icon" onClick={() => removeRow(i)} title="Remove">
                <X className="size-3.5" />
              </Button>
            </div>
          ))}
          <Button variant="ghost" size="sm" onClick={addRow}>
            <Plus className="size-3" />
            Add condition
          </Button>
          {fields.length > 0 && (
            <datalist id={listId}>
              {fields.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
          )}
        </>
      )}
    </div>
  );
}
