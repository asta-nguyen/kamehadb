import { useId, useReducer } from 'react';
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

interface QdrantFilterBuilderProps {
  value?: Record<string, unknown> | undefined;
  onChange: (filter: Record<string, unknown> | undefined) => void;
  fields?: string[];
}

// Group combinator/rows/advanced/json state so a single dispatch produces a
// single re-render instead of four.
type FilterState = {
  combinator: Combinator;
  rows: Row[];
  advanced: boolean;
  json: string;
  jsonError: string | null;
};

type FilterAction =
  | { type: 'setCombinator'; value: Combinator }
  | { type: 'updateRow'; index: number; patch: Partial<Row> }
  | { type: 'addRow' }
  | { type: 'removeRow'; index: number }
  | { type: 'setAdvanced'; value: boolean }
  | { type: 'setJson'; value: string; error: string | null };

function filterReducer(state: FilterState, action: FilterAction): FilterState {
  switch (action.type) {
    case 'setCombinator':
      return { ...state, combinator: action.value };
    case 'updateRow':
      return {
        ...state,
        rows: state.rows.map((r, idx) => (idx === action.index ? { ...r, ...action.patch } : r)),
      };
    case 'addRow':
      return { ...state, rows: [...state.rows, { key: '', op: 'eq', value: '' }] };
    case 'removeRow':
      return { ...state, rows: state.rows.filter((_, idx) => idx !== action.index) };
    case 'setAdvanced':
      return { ...state, advanced: action.value };
    case 'setJson':
      return { ...state, json: action.value, jsonError: action.error };
  }
}

export function QdrantFilterBuilder({ value: _value, onChange, fields = [] }: QdrantFilterBuilderProps) {
  const [state, dispatch] = useReducer(filterReducer, {
    combinator: 'must',
    rows: [],
    advanced: false,
    json: '',
    jsonError: null,
  });
  const listId = useId();

  const handleJson = (text: string) => {
    if (!text.trim()) {
      dispatch({ type: 'setJson', value: text, error: null });
      onChange(undefined);
      return;
    }
    try {
      onChange(JSON.parse(text));
      dispatch({ type: 'setJson', value: text, error: null });
    } catch {
      dispatch({ type: 'setJson', value: text, error: 'Invalid JSON' });
      onChange(undefined);
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Filter</span>
        {!state.advanced && state.rows.length > 0 && (
          <Select
            value={state.combinator}
            onValueChange={(v) => dispatch({ type: 'setCombinator', value: v as Combinator })}
          >
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
        <Button
          variant="ghost"
          size="sm"
          onClick={() => dispatch({ type: 'setAdvanced', value: !state.advanced })}
          className="ml-auto"
        >
          {state.advanced ? 'Visual' : 'Advanced JSON'}
        </Button>
      </div>

      {state.advanced ? (
        <>
          <div className="relative">
            <Textarea
              value={state.json}
              onChange={(e) => handleJson(e.target.value)}
              placeholder='{ "must": [{ "key": "kind", "match": { "value": "fruit" } }] }'
              spellCheck={false}
              className="w-full min-h-16 px-2 py-1 text-xs font-mono bg-background border rounded resize-y focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
            {state.json && !state.jsonError && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  try {
                    handleJson(JSON.stringify(JSON.parse(state.json), null, 2));
                  } catch {}
                }}
                title="Format JSON"
              >
                {'{ }'}
              </Button>
            )}
          </div>
          {state.jsonError && <div className="text-xs text-destructive">{state.jsonError}</div>}
        </>
      ) : (
        <>
          {state.rows.map((row, i) => (
            <div key={`${i}-${row.key}`} className="flex items-center gap-1.5">
              <Input
                value={row.key}
                onChange={(e) => dispatch({ type: 'updateRow', index: i, patch: { key: e.target.value } })}
                placeholder="field"
                list={fields.length ? listId : undefined}
                className="flex-1 h-7 px-2 text-xs font-mono bg-background border rounded focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
              <Select
                value={row.op}
                onValueChange={(v) => dispatch({ type: 'updateRow', index: i, patch: { op: v as Op } })}
              >
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
                onChange={(e) => dispatch({ type: 'updateRow', index: i, patch: { value: e.target.value } })}
                placeholder="value"
                className="flex-1 h-7 px-2 text-xs font-mono bg-background border rounded focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => dispatch({ type: 'removeRow', index: i })}
                title="Remove"
              >
                <X className="size-3" />
              </Button>
            </div>
          ))}
          <Button variant="ghost" size="sm" onClick={() => dispatch({ type: 'addRow' })}>
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
