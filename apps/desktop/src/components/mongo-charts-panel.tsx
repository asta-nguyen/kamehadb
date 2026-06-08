import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { post } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ChartView } from '@/components/chart-view';
import { Loader2, AlertCircle, BarChart3 } from 'lucide-react';
import type { DocumentResult, QueryResult } from '@kamehadb/shared';

type AggType = 'count' | 'sum' | 'avg' | 'min' | 'max';

const AGG_LABELS: Record<AggType, string> = {
  count: 'Count',
  sum: 'Sum',
  avg: 'Avg',
  min: 'Min',
  max: 'Max',
};

interface MongoChartsPanelProps {
  connectionId: string;
  database: string;
  collection: string;
}

// Extract a readable label from the grouped _id value, which could be
// a primitive, a date string, or a nested object.
function formatGroupKey(val: unknown): string {
  if (val === null || val === undefined) return '(empty)';
  if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (val instanceof Date) return val.toISOString();
  return JSON.stringify(val);
}

export function MongoChartsPanel({ connectionId, database, collection }: MongoChartsPanelProps) {
  // Fetch one sample document so we can suggest available fields
  const { data: sampleDoc, isLoading: docLoading } = useQuery({
    queryKey: ['mongo-sample-doc', connectionId, database, collection],
    queryFn: async () => {
      const res = await post<DocumentResult>(`/mongo/${connectionId}/find`, {
        collection,
        database,
        limit: 1,
        projection: {},
      });
      return res.documents[0] ?? null;
    },
    enabled: !!connectionId && !!database && !!collection,
    staleTime: 30_000,
  });

  // Partition the sample doc's keys into string-ish and numeric fields
  const allFields = useMemo(() => (sampleDoc ? Object.keys(sampleDoc).filter((k) => k !== '_id') : []), [sampleDoc]);

  const numericFields = useMemo(
    () => allFields.filter((k) => typeof sampleDoc![k] === 'number'),
    [allFields, sampleDoc],
  );

  const stringFields = useMemo(
    () => allFields.filter((k) => typeof sampleDoc![k] === 'string' || typeof sampleDoc![k] === 'object'),
    [allFields, sampleDoc],
  );

  // Chart configuration
  const [xField, setXField] = useState('');
  const [yField, setYField] = useState('');
  const [aggType, setAggType] = useState<AggType>('count');
  const [chartResult, setChartResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  // Build a MongoDB aggregation pipeline from the chart config and
  // run it against the sidecar, then convert to QueryResult for ChartView.
  const generateChart = useCallback(async () => {
    if (!xField) return;
    setRunning(true);
    setError(null);
    setChartResult(null);

    try {
      const pipeline: Record<string, unknown>[] = [];

      // Build the $group stage
      const group: Record<string, unknown> = { _id: `$${xField}` };
      if (aggType === 'count') {
        group.value = { $sum: 1 };
      } else {
        if (!yField) {
          setError('Select a numeric field for Y-axis');
          setRunning(false);
          return;
        }
        group.value = { [`$${aggType}`]: `$${yField}` };
      }
      pipeline.push({ $group: group });
      pipeline.push({ $sort: { value: -1 } });
      pipeline.push({ $limit: 50 });

      const res = await post<DocumentResult>(`/mongo/${connectionId}/aggregate`, {
        collection,
        database,
        pipeline,
      });

      // Convert DocumentResult to QueryResult so ChartView can consume it
      const rows = res.documents.map((d) => ({
        _id: formatGroupKey(d._id),
        value: d.value,
      }));

      setChartResult({
        columns: [
          { name: '_id', type: 'string' },
          { name: 'value', type: 'number' },
        ],
        rows,
        rowCount: rows.length,
        durationMs: res.durationMs ?? 0,
        truncated: res.hasMore ?? false,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chart generation failed');
    } finally {
      setRunning(false);
    }
  }, [connectionId, database, collection, xField, yField, aggType]);

  const canGenerate = !!xField && (aggType === 'count' || !!yField);

  return (
    <div className="p-4 space-y-4">
      {/* Configuration bar */}
      <div className="flex items-end gap-3 flex-wrap">
        {/* X-axis / category field */}
        <div className="flex flex-col gap-1.5 min-w-36">
          <Label className="text-xs text-muted-foreground">Category (X-axis)</Label>
          <Select value={xField} onValueChange={(v) => v && setXField(v)} disabled={docLoading}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder={docLoading ? 'Loading...' : 'Select field'} />
            </SelectTrigger>
            <SelectContent>
              {stringFields.map((f) => (
                <SelectItem key={f} value={f} className="text-xs">
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Aggregation type */}
        <div className="flex flex-col gap-1.5 min-w-24">
          <Label className="text-xs text-muted-foreground">Aggregate</Label>
          <Select value={aggType} onValueChange={(v) => setAggType(v as AggType)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(AGG_LABELS) as AggType[]).map((k) => (
                <SelectItem key={k} value={k} className="text-xs">
                  {AGG_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Y-axis / numeric field (hidden for count) */}
        {aggType !== 'count' && (
          <div className="flex flex-col gap-1.5 min-w-36">
            <Label className="text-xs text-muted-foreground">Value (Y-axis)</Label>
            <Select
              value={yField}
              onValueChange={(v) => v && setYField(v)}
              disabled={docLoading || numericFields.length === 0}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue
                  placeholder={
                    docLoading ? 'Loading...' : numericFields.length === 0 ? 'No numeric fields' : 'Select field'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {numericFields.map((f) => (
                  <SelectItem key={f} value={f} className="text-xs">
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Generate button */}
        <Button
          variant="default"
          size="sm"
          onClick={generateChart}
          disabled={!canGenerate || running}
          className="h-8 text-xs gap-1.5"
        >
          {running ? <Loader2 className="size-3.5 animate-spin" /> : <BarChart3 className="size-3.5" />}
          {running ? 'Running...' : 'Generate Chart'}
        </Button>
      </div>

      {/* Chart area */}
      {running ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex items-start gap-2 text-sm text-destructive">
          <AlertCircle className="size-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : chartResult && chartResult.rows.length > 0 ? (
        <ChartView result={chartResult} />
      ) : chartResult && chartResult.rows.length === 0 ? (
        <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
          No data returned for this grouping
        </div>
      ) : (
        <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
          Select a category field and click Generate Chart
        </div>
      )}
    </div>
  );
}
