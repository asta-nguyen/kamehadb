import { useState, useMemo, useEffect } from 'react';
import type { QueryResult } from '@kamehadb/shared';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

type ChartKind = 'bar' | 'line' | 'area' | 'pie';

const CHART_COLORS = [
  'hsl(221.2, 83.2%, 53.3%)',
  'hsl(142.1, 76.2%, 36.3%)',
  'hsl(24.6, 95%, 53.1%)',
  'hsl(346.8, 77.2%, 49.8%)',
  'hsl(271.5, 81.3%, 55.9%)',
  'hsl(187.8, 100%, 42.2%)',
];

function detectNumericColumns(result: QueryResult): string[] {
  const numericTypes = [
    'int',
    'integer',
    'bigint',
    'smallint',
    'float',
    'double',
    'decimal',
    'numeric',
    'real',
    'number',
  ];
  return result.columns.filter((c) => numericTypes.some((t) => c.type.toLowerCase().includes(t))).map((c) => c.name);
}

function detectCategoricalColumns(result: QueryResult): string[] {
  const numeric = detectNumericColumns(result);
  return result.columns.filter((c) => !numeric.includes(c.name)).map((c) => c.name);
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return value.toLocaleString();
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  return String(value);
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: unknown; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="px-3 py-2 text-xs bg-popover rounded-lg shadow-md border space-y-1">
      <p className="pb-1 mb-1 text-foreground/90 font-medium border-b border-border">{String(label ?? '')}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2">
          <span className="size-2.5 rounded-xs shrink-0" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="text-foreground/90 font-medium tabular-nums">{formatValue(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function ChartView({ result }: { result: QueryResult }) {
  const [chartKind, setChartKind] = useState<ChartKind>('bar');
  const [xColumn, setXColumn] = useState('');
  const [yColumns, setYColumns] = useState<string[]>([]);

  const catColumns = useMemo(() => detectCategoricalColumns(result), [result]);
  const numColumns = useMemo(() => detectNumericColumns(result), [result]);

  // Auto-select first categorical as X, first numeric as Y
  useEffect(() => {
    if (!xColumn && catColumns.length > 0) setXColumn(catColumns[0]);
    if (yColumns.length === 0 && numColumns.length > 0) setYColumns([numColumns[0]]);
  }, [catColumns, numColumns, xColumn, yColumns.length]);

  const handleYChange = (value: string | null) => setYColumns(value ? [value] : []);

  if (result.rows.length === 0) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">No data to chart</div>;
  }

  if (numColumns.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
        No numeric columns found. Charts require at least one numeric column.
      </div>
    );
  }

  return (
    <div className="flex flex-col p-4 gap-4">
      <div className="flex items-center flex-wrap gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground font-medium">Chart:</span>
          <Select value={chartKind} onValueChange={(v) => setChartKind(v as ChartKind)}>
            <SelectTrigger className="w-24 h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bar" className="text-xs">
                Bar
              </SelectItem>
              <SelectItem value="line" className="text-xs">
                Line
              </SelectItem>
              <SelectItem value="area" className="text-xs">
                Area
              </SelectItem>
              <SelectItem value="pie" className="text-xs">
                Pie
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground font-medium">X-axis:</span>
          <Select
            value={xColumn}
            onValueChange={(v) => {
              if (!v) return;
              setXColumn(v);
              if (chartKind === 'pie') setYColumns(numColumns.length > 0 ? [numColumns[0]] : []);
            }}
          >
            <SelectTrigger className="w-auto min-w-28 h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {catColumns.map((col) => (
                <SelectItem key={col} value={col} className="text-xs">
                  {col}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {chartKind !== 'pie' ? (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground font-medium">Y-axis:</span>
            <Select value={yColumns[0] ?? ''} onValueChange={handleYChange}>
              <SelectTrigger className="w-auto min-w-28 h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {numColumns.map((col) => (
                  <SelectItem key={col} value={col} className="text-xs">
                    {col}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground font-medium">Value:</span>
            <Select value={yColumns[0] ?? ''} onValueChange={handleYChange}>
              <SelectTrigger className="w-auto min-w-28 h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {numColumns.map((col) => (
                  <SelectItem key={col} value={col} className="text-xs">
                    {col}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="flex-1 min-h-[300px]">
        <ResponsiveContainer width="100%" height={350}>
          {chartKind === 'bar' ? (
            <BarChart data={result.rows} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
              <XAxis dataKey={xColumn} tick={{ fontSize: 11 }} className="text-muted-foreground" />
              <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              {yColumns.map((col, i) => (
                <Bar key={col} dataKey={col} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={[3, 3, 0, 0]} />
              ))}
            </BarChart>
          ) : chartKind === 'line' ? (
            <LineChart data={result.rows} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
              <XAxis dataKey={xColumn} tick={{ fontSize: 11 }} className="text-muted-foreground" />
              <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              {yColumns.map((col, i) => (
                <Line
                  key={col}
                  type="monotone"
                  dataKey={col}
                  stroke={CHART_COLORS[i % CHART_COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              ))}
            </LineChart>
          ) : chartKind === 'area' ? (
            <AreaChart data={result.rows} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
              <XAxis dataKey={xColumn} tick={{ fontSize: 11 }} className="text-muted-foreground" />
              <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              {yColumns.map((col, i) => (
                <Area
                  key={col}
                  type="monotone"
                  dataKey={col}
                  stroke={CHART_COLORS[i % CHART_COLORS.length]}
                  fill={CHART_COLORS[i % CHART_COLORS.length]}
                  fillOpacity={0.15}
                />
              ))}
            </AreaChart>
          ) : (
            (() => {
              // Limit pie slices to 20 to avoid unreadable charts with hundreds of categories.
              // Sort by value desc, take top 20, group remainder as "Other".
              const MAX_SLICES = 20;
              const yKey = yColumns[0];
              let pieData = [...result.rows];
              const wasTruncated = pieData.length > MAX_SLICES;
              if (wasTruncated) {
                const sorted = pieData.sort((a, b) => Number(b[yKey] ?? 0) - Number(a[yKey] ?? 0));
                const top = sorted.slice(0, MAX_SLICES);
                const restSum = sorted.slice(MAX_SLICES).reduce((s, r) => s + Number(r[yKey] ?? 0), 0);
                pieData = restSum > 0 ? [...top, { [xColumn]: 'Other', [yKey]: restSum } as any] : top;
              }
              return (
                <PieChart margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <Pie
                    data={pieData}
                    dataKey={yKey}
                    nameKey={xColumn}
                    cx="50%"
                    cy="50%"
                    outerRadius={120}
                    label={(entry: any) =>
                      `${String(entry.name ?? '')} (${(Number(entry.percent ?? 0) * 100).toFixed(0)}%)`
                    }
                    labelLine
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                </PieChart>
              );
            })()
          )}
        </ResponsiveContainer>
        {chartKind === 'pie' && result.rows.length > 20 && (
          <p className="mt-1 text-xs text-muted-foreground text-center">
            Showing top 20 of {result.rows.length} categories; {result.rows.length - 20} grouped into "Other"
          </p>
        )}
      </div>
    </div>
  );
}
