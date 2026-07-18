import { formatBytes, formatNumber } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BarChart3, Database, HardDrive, RefreshCw, Trash2, Activity, AlertTriangle } from 'lucide-react';
import { useTableStats, useIndexStats } from '@/hooks/use-schema';

type TableStatsProps = {
  connectionId: number;
  tableId: string;
};

export function TableStats({ connectionId, tableId }: TableStatsProps) {
  const { data: stats, isLoading, error } = useTableStats(connectionId, tableId);
  const { data: indexStats } = useIndexStats(connectionId, tableId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="text-muted-foreground animate-spin size-5" />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <AlertTriangle className="mr-2 size-5" />
        Failed to load table statistics
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Overview */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Total Size</CardTitle>
            <Database className="text-muted-foreground size-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatBytes(stats.totalBytes)}</div>
            <p className="text-muted-foreground text-xs">~{formatNumber(stats.rowEstimate)} rows</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Indexes</CardTitle>
            <BarChart3 className="text-muted-foreground size-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatBytes(stats.indexesBytes)}</div>
            <p className="text-muted-foreground text-xs">{indexStats?.length || 0} indexes</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Live Rows</CardTitle>
            <Activity className="text-muted-foreground size-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(stats.nLiveTup)}</div>
            <p className="text-muted-foreground text-xs">
              {stats.nDeadTup > 0 && <span className="text-destructive">{formatNumber(stats.nDeadTup)} dead</span>}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Bloat</CardTitle>
            <Trash2 className="text-muted-foreground size-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatBytes(stats.bloatBytes)}</div>
            <p className="text-muted-foreground text-xs">{(stats.bloatPercent ?? 0).toFixed(1)}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Bloat Warning */}
      {(stats.bloatPercent ?? 0) > 10 && (
        <Card className="bg-destructive/5 border-destructive/50">
          <CardContent className="flex items-center py-3 gap-3">
            <AlertTriangle className="text-destructive shrink-0 size-5" />
            <div className="text-sm">
              <strong>Bloat detected:</strong> This table has {(stats.bloatPercent ?? 0).toFixed(1)}% bloat (
              {formatBytes(stats.bloatBytes)}). Consider running{' '}
              <code className="px-1 py-0.5 text-xs bg-muted rounded-xs">VACUUM FULL</code> to reclaim space.
            </div>
          </CardContent>
        </Card>
      )}

      {/* Size Breakdown — only show when we have actual size data */}
      {stats.totalBytes > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center text-base gap-2">
              <HardDrive className="size-4" />
              Size Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(() => {
              const tableBytes = stats.totalBytes - stats.indexesBytes - stats.toastBytes;
              const total = stats.totalBytes;
              const segments = [
                { label: 'Table Data', bytes: Math.max(tableBytes, 0), color: 'bg-primary' },
                { label: 'Indexes', bytes: stats.indexesBytes, color: 'bg-blue-500' },
                ...(stats.toastBytes > 0 ? [{ label: 'TOAST', bytes: stats.toastBytes, color: 'bg-amber-500' }] : []),
              ].filter((s) => s.bytes > 0);
              const segmentSum = segments.reduce((sum, s) => sum + s.bytes, 0);
              const remainder = total - segmentSum;
              if (remainder > 0) {
                segments.push({ label: 'Other', bytes: remainder, color: 'bg-muted-foreground/30' });
              }

              return (
                <>
                  {/* Stacked bar */}
                  <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
                    {segments.map((s) => (
                      <div
                        key={s.label}
                        className={`${s.color} transition-all`}
                        style={{ width: `${(s.bytes / total) * 100}%` }}
                        title={`${s.label}: ${formatBytes(s.bytes)}`}
                      />
                    ))}
                  </div>
                  {/* Legend */}
                  <div className="space-y-1.5">
                    {segments.map((s) => (
                      <div key={s.label} className="flex justify-between text-sm">
                        <span className="flex items-center gap-2">
                          <span className={`inline-block size-3 rounded-sm ${s.color}`} />
                          {s.label}
                        </span>
                        <span className="text-muted-foreground">
                          {formatBytes(s.bytes)} ({((s.bytes / total) * 100).toFixed(1)}%)
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* Indexes */}
      {indexStats && indexStats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Indexes ({indexStats.length})</CardTitle>
            <CardDescription>Index usage and statistics</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow
                  style={{ gridTemplateColumns: 'minmax(150px, 2fr) minmax(120px, 2fr) 80px 60px 80px 100px 80px' }}
                >
                  <TableHead>Name</TableHead>
                  <TableHead>Columns</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Scans</TableHead>
                  <TableHead>Usage</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Type</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {indexStats.map((idx) => (
                  <TableRow
                    key={idx.name}
                    style={{ gridTemplateColumns: 'minmax(150px, 2fr) minmax(120px, 2fr) 80px 60px 80px 100px 80px' }}
                  >
                    <TableCell className="min-w-0 text-sm font-mono truncate" title={idx.name}>
                      {idx.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <div className="flex flex-wrap gap-1">
                        {idx.columns.map((col) => (
                          <Badge key={col} variant="outline" className="text-xs">
                            {col}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>{formatBytes(idx.sizeBytes ?? 0)}</TableCell>
                    <TableCell>{formatNumber(idx.scans ?? 0)}</TableCell>
                    <TableCell>
                      {(idx.usagePercent ?? 0) > 0 ? (
                        <span className={(idx.usagePercent ?? 0) < 10 ? 'text-destructive' : ''}>
                          {(idx.usagePercent ?? 0).toFixed(1)}%
                        </span>
                      ) : (
                        <Badge variant="destructive" className="text-xs">
                          Unused
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {idx.method ? (
                        <Badge variant="secondary">{idx.method}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {idx.primary ? (
                        <Badge>PRIMARY</Badge>
                      ) : idx.unique ? (
                        <Badge variant="secondary">UNIQUE</Badge>
                      ) : (
                        <Badge variant="outline">INDEX</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Maintenance Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Maintenance</CardTitle>
          <CardDescription>Vacuum and analyze statistics</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Last Vacuum</h4>
              <p className="text-muted-foreground text-sm">{stats.lastVacuum || stats.lastAutovacuum || 'Never'}</p>
              <p className="text-muted-foreground text-xs">
                Total: {stats.vacuumCount} manual, {stats.autovacuumCount} auto
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Last Analyze</h4>
              <p className="text-muted-foreground text-sm">{stats.lastAnalyze || stats.lastAutoanalyze || 'Never'}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
