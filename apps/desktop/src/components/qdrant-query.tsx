import { useEffect, useMemo, useState } from 'react';
import type { QdrantSearchResult, WorkspaceTab } from '@kamehadb/shared';
import { useQdrantCollections, useQdrantPoints, useQdrantRecommend, useQdrantSearch } from '@/hooks/use-qdrant';
import { Button } from '@/components/ui/button';
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

  useEffect(() => {
    setResult(null);
    setInfo(null);
    setError(null);
  }, [collection, mode]);

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
            <button
              key={m.value}
              onClick={() => setMode(m.value)}
              className={`px-2.5 py-1 text-xs rounded transition-colors ${
                mode === m.value
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <select
            value={collection}
            onChange={(e) => setCollection(e.target.value)}
            className="h-7 px-2 text-xs bg-background border rounded focus:outline-none focus:ring-1 focus:ring-primary/50"
          >
            {!collection && <option value="">Select collection…</option>}
            {collections?.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
          <label className="text-xs text-muted-foreground flex items-center gap-1">
            Limit
            <input
              type="number"
              min={1}
              max={500}
              value={limit}
              onChange={(e) => setLimit(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
              className="h-7 w-16 px-2 text-xs bg-background border rounded focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </label>
          <Button size="sm" onClick={run} disabled={running} className="ml-auto">
            {running ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <Play className="size-3.5 mr-1.5" />}
            Search
          </Button>
        </div>

        {/* Mode-specific input */}
        {mode === 'text' && (
          <div className="space-y-2">
            <input
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
            <input
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
          <textarea
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
          result.hits.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">No results</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/50 backdrop-blur">
                <tr className="text-left text-muted-foreground">
                  <th className="px-3 py-1.5 font-medium w-40">ID</th>
                  <th className="px-3 py-1.5 font-medium w-24">Score</th>
                  <th className="px-3 py-1.5 font-medium">Payload</th>
                </tr>
              </thead>
              <tbody>
                {result.hits.map((h) => (
                  <tr key={String(h.id)} className="border-b border-border/50 align-top">
                    <td className="px-3 py-1.5 font-mono text-muted-foreground break-all">{String(h.id)}</td>
                    <td className="px-3 py-1.5 font-mono">{h.score.toFixed(4)}</td>
                    <td className="px-3 py-1.5">
                      <pre className="font-mono whitespace-pre-wrap break-all">
                        {h.payload ? JSON.stringify(h.payload, null, 2) : '—'}
                      </pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
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
