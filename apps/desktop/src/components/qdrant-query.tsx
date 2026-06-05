import { useEffect, useMemo, useState } from 'react';
import type { QdrantSearchResult, WorkspaceTab } from '@kamehadb/shared';
import { useQdrantCollections, useQdrantPoints, useQdrantRecommend, useQdrantSearch } from '@/hooks/use-qdrant';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DataTable, type ColumnDef } from '@/components/data-table';
import { QdrantFilterBuilder } from '@/components/qdrant-filter-builder';
import { Loader2, Play } from 'lucide-react';

function simpleEmbed(text: string, dims: number): number[] {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  const vec = new Array(dims).fill(0);
  for (const word of words) {
    let h = 0;
    for (let i = 0; i < word.length; i++) {
      h = (h << 5) - h + word.charCodeAt(i);
      h |= 0;
    }
    const idx = ((h % dims) + dims) % dims;
    vec[idx] += 1;
  }
  if (words.length === 0) return vec;
  const mag = Math.sqrt(vec.reduce((s, x) => s + x * x, 0)) || 1;
  return vec.map((x) => x / mag);
}

interface QdrantQueryProps {
  tab: Extract<WorkspaceTab, { type: 'qdrant-search' }>;
  connectionId: string;
}

type Mode = 'text' | 'similar' | 'raw';

const MODES: { value: Mode; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'similar', label: 'Find similar' },
  { value: 'raw', label: 'Advanced' },
];

export function QdrantQuery({ tab, connectionId }: QdrantQueryProps) {
  const { data: collections } = useQdrantCollections(connectionId);
  const [collection, setCollection] = useState(tab.collection ?? '');
  const [mode, setMode] = useState<Mode>(tab.mode ?? (tab.pointId ? 'similar' : 'text'));

  const [text, setText] = useState('');
  const [pointId, setPointId] = useState(tab.pointId ?? '');
  const [vectorText, setVectorText] = useState('');
  const [filter, setFilter] = useState<Record<string, unknown> | undefined>(undefined);
  const [limit, setLimit] = useState(10);

  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [result, setResult] = useState<QdrantSearchResult | null>(null);

  const search = useQdrantSearch(connectionId);
  const recommend = useQdrantRecommend(connectionId);

  // Sample the chosen collection to get vector size and payload fields.
  const { data: sample } = useQdrantPoints(connectionId, collection || null);
  const fields = useMemo(() => {
    const keys = new Set<string>();
    for (const p of sample?.points ?? []) for (const k of Object.keys(p.payload ?? {})) keys.add(k);
    return [...keys];
  }, [sample]);

  const vectorSize = useMemo(() => {
    const first = sample?.points?.[0]?.vector;
    if (Array.isArray(first) && typeof first[0] === 'number') return first.length;
    if (first && typeof first === 'object') {
      const v = Object.values(first as Record<string, unknown>)[0];
      if (Array.isArray(v)) return v.length;
    }
    return 128;
  }, [sample]);

  type QdrantHit = {
    id: string | number;
    score: number;
    payload?: Record<string, unknown>;
  };

  const columns: ColumnDef<QdrantHit>[] = useMemo(
    () => [
      {
        id: 'id',
        header: 'ID',
        accessor: (row) => row.id,
        headerClassName: 'px-3 py-1.5 font-medium h-auto',
        cellClassName: 'px-3 py-1.5 font-mono text-muted-foreground break-all',
        render: (value) => <span>{String(value)}</span>,
      },
      {
        id: 'score',
        header: 'Score',
        accessor: (row) => row.score,
        headerClassName: 'px-3 py-1.5 font-medium h-auto',
        cellClassName: 'px-3 py-1.5 font-mono',
        render: (value) => <span>{(value as number).toFixed(4)}</span>,
      },
      {
        id: 'payload',
        header: 'Payload',
        accessor: (row) => row.payload,
        headerClassName: 'px-3 py-1.5 font-medium h-auto',
        cellClassName: 'px-3 py-1.5',
        render: (value) => (
          <pre className="font-mono whitespace-pre-wrap break-all">{value ? JSON.stringify(value, null, 2) : '—'}</pre>
        ),
      },
    ],
    [],
  );

  // Default to the first collection once they load, if none preselected.
  useEffect(() => {
    if (!collection && collections?.length) setCollection(collections[0].name);
  }, [collections, collection]);

  const run = async () => {
    setError(null);
    setInfo(null);
    if (!collection) {
      setError('Select a collection');
      return;
    }

    setRunning(true);
    try {
      if (mode === 'text') {
        if (!text.trim()) {
          setError('Enter some text to search for');
          return;
        }
        const vector = simpleEmbed(text, vectorSize);
        setInfo(`Embedded to ${vectorSize} dimensions (local hash-based)`);
        const res = await search.mutateAsync({ collection, vector, limit, filter, withPayload: true });
        setResult(res);
      } else if (mode === 'similar') {
        if (!pointId.trim()) {
          setError('Enter a point ID');
          return;
        }
        const id = /^\d+$/.test(pointId.trim()) ? Number(pointId.trim()) : pointId.trim();
        const res = await recommend.mutateAsync({ collection, pointId: id, limit, filter, withPayload: true });
        setResult(res);
      } else {
        let vector: number[];
        try {
          const parsed = JSON.parse(vectorText);
          if (!Array.isArray(parsed) || !parsed.every((n) => typeof n === 'number')) {
            throw new Error('Vector must be a JSON array of numbers, e.g. [0.1, 0.2, 0.3]');
          }
          vector = parsed;
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Invalid query vector');
          return;
        }
        const res = await search.mutateAsync({ collection, vector, limit, filter, withPayload: true });
        setResult(res);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border space-y-2">
        {/* Mode tabs */}
        <div className="flex items-center gap-1 bg-muted/40 rounded-md p-0.5 w-fit">
          {MODES.map((m) => (
            <Button
              key={m.value}
              variant="ghost"
              size="sm"
              onClick={() => setMode(m.value)}
              className={`${mode === m.value ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {m.label}
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Select
            value={collection || '_select'}
            onValueChange={(v) => setCollection(v === '_select' || v == null ? '' : v)}
          >
            <SelectTrigger size="sm" className="h-7 text-xs">
              <SelectValue placeholder="Select collection…" />
            </SelectTrigger>
            <SelectContent>
              {collections?.map((c) => (
                <SelectItem key={c.name} value={c.name}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Label className="text-xs text-muted-foreground flex items-center gap-1">
            Limit
            <Input
              type="number"
              min={1}
              max={500}
              value={limit}
              onChange={(e) => setLimit(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
              className="h-7 w-16 px-2 text-xs bg-background border rounded focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </Label>
          <Button size="sm" onClick={run} disabled={running} className="ml-auto">
            {running ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <Play className="size-3.5 mr-1.5" />}
            Search
          </Button>
        </div>

        {/* Mode-specific input */}
        {mode === 'text' && (
          <div className="space-y-2">
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Describe what you're looking for…"
              className="w-full h-9 px-2 text-sm bg-background border rounded focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
            <p className="text-xs text-muted-foreground">
              Text is converted to a vector locally using hash-based embedding — no AI provider needed. Works at
              {vectorSize} dimensions.
            </p>
          </div>
        )}

        {mode === 'similar' && (
          <div className="space-y-1">
            <Input
              value={pointId}
              onChange={(e) => setPointId(e.target.value)}
              placeholder="Point ID to find neighbors of"
              className="w-full h-9 px-2 text-sm font-mono bg-background border rounded focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
            <p className="text-xs text-muted-foreground">
              Finds points most similar to an existing point — no model needed.
            </p>
          </div>
        )}

        {mode === 'raw' && (
          <Textarea
            value={vectorText}
            onChange={(e) => setVectorText(e.target.value)}
            placeholder="[0.1, 0.2, 0.3, ...]"
            spellCheck={false}
            className="w-full min-h-20 px-2 py-1 text-xs font-mono bg-background border rounded resize-y focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        )}

        <QdrantFilterBuilder onChange={setFilter} fields={fields} />

        {error && <div className="text-xs text-destructive">{error}</div>}
        {info && !error && <div className="text-xs text-muted-foreground">{info}</div>}
      </div>

      <div className="flex-1 overflow-auto min-h-0">
        {result ? (
          <DataTable
            rows={result.hits}
            columns={columns}
            rowKey={(h) => String(h.id)}
            fixedTemplate="160px 96px minmax(0, 1fr)"
            stickyHeader
            emptyMessage="No results"
            className="overflow-visible"
          />
        ) : (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            {mode === 'text'
              ? 'Type a query and run a search'
              : mode === 'similar'
                ? 'Enter a point ID to find similar points'
                : 'Enter a query vector and run a search'}
          </div>
        )}
      </div>

      {result && (
        <div className="px-3 py-1.5 border-t border-border text-xs text-muted-foreground">
          {result.hits.length} results in {result.durationMs}ms
        </div>
      )}
    </div>
  );
}
