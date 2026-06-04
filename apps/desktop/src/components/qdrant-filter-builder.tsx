import { useEffect, useId, useState } from 'react';
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
  const conditions = rows
    .filter((r) => r.key.trim() && r.value.trim())
    .map((r) => {
      if (r.op === 'eq') return { key: r.key.trim(), match: { value: coerce(r.value) } };
      return { key: r.key.trim(), range: { [r.op]: Number(r.value) } };
    });
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
          <select
            value={combinator}
            onChange={(e) => setCombinator(e.target.value as Combinator)}
            className="h-6 px-1.5 text-xs bg-background border rounded focus:outline-none focus:ring-1 focus:ring-primary/50"
            title="Match"
          >
            {COMBINATORS.map((c) => (
              <option key={c.value} value={c.value}>
                Match {c.label}
              </option>
            ))}
          </select>
        )}
        <button
          onClick={() => setAdvanced(!advanced)}
          className="ml-auto text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
        >
          {advanced ? 'Visual' : 'Advanced JSON'}
        </button>
      </div>

      {advanced ? (
        <>
          <div className="relative">
            <textarea
              value={json}
              onChange={(e) => handleJson(e.target.value)}
              placeholder='{ "must": [{ "key": "kind", "match": { "value": "fruit" } }] }'
              spellCheck={false}
              className="w-full min-h-16 px-2 py-1 text-xs font-mono bg-background border rounded resize-y focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
            {json && !jsonError && (
              <button
                onClick={() => {
                  try {
                    handleJson(JSON.stringify(JSON.parse(json), null, 2));
                  } catch {}
                }}
                className="absolute top-1 right-1 text-[10px] px-1.5 py-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50"
                title="Format JSON"
              >
                {'{ }'}
              </button>
            )}
          </div>
          {jsonError && <div className="text-xs text-destructive">{jsonError}</div>}
        </>
      ) : (
        <>
          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input
                value={row.key}
                onChange={(e) => updateRow(i, { key: e.target.value })}
                placeholder="field"
                list={fields.length ? listId : undefined}
                className="flex-1 h-7 px-2 text-xs font-mono bg-background border rounded focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
              <select
                value={row.op}
                onChange={(e) => updateRow(i, { op: e.target.value as Op })}
                className="h-7 px-1 text-xs bg-background border rounded focus:outline-none focus:ring-1 focus:ring-primary/50"
              >
                {OPS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <input
                value={row.value}
                onChange={(e) => updateRow(i, { value: e.target.value })}
                placeholder="value"
                className="flex-1 h-7 px-2 text-xs font-mono bg-background border rounded focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
              <button
                onClick={() => removeRow(i)}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                title="Remove"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
          <button
            onClick={addRow}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <Plus className="size-3" />
            Add condition
          </button>
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
