import { formatBytes, formatNumber } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BarChart3, Database, HardDrive, RefreshCw, Trash2, Activity, AlertTriangle } from 'lucide-react';
import { useTableStats, useIndexStats } from '@/hooks/use-schema';

type TableStatsProps = {
  connectionId: string;
  tableId: string;
};

export function TableStats({ connectionId, tableId }: TableStatsProps) {
  const { data: stats, isLoading, error } = useTableStats(connectionId, tableId);
  const { data: indexStats } = useIndexStats(connectionId, tableId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <AlertTriangle className="size-5 mr-2" />
        Failed to load table statistics
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {/* Overview */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Size</CardTitle>
            <Database className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatBytes(stats.totalBytes)}</div>
            <p className="text-xs text-muted-foreground">~{formatNumber(stats.rowEstimate)} rows</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Indexes</CardTitle>
            <BarChart3 className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatBytes(stats.indexesBytes)}</div>
            <p className="text-xs text-muted-foreground">{indexStats?.length || 0} indexes</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Live Rows</CardTitle>
            <Activity className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(stats.nLiveTup)}</div>
            <p className="text-xs text-muted-foreground">
              {stats.nDeadTup > 0 && <span className="text-destructive">{formatNumber(stats.nDeadTup)} dead</span>}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bloat</CardTitle>
            <Trash2 className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatBytes(stats.bloatBytes)}</div>
            <p className="text-xs text-muted-foreground">{stats.bloatPercent.toFixed(1)}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Bloat Warning */}
      {stats.bloatPercent > 10 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="flex items-center gap-3 py-3">
            <AlertTriangle className="size-5 text-destructive shrink-0" />
            <div className="text-sm">
              <strong>Bloat detected:</strong> This table has {stats.bloatPercent.toFixed(1)}% bloat (
              {formatBytes(stats.bloatBytes)}). Consider running{' '}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">VACUUM FULL</code> to reclaim space.
            </div>
          </CardContent>
        </Card>
      )}

      {/* Size Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <HardDrive className="size-4" />
            Size Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <div className="flex justify-between text-sm">
              <span>Table Data</span>
              <span className="text-muted-foreground">{formatBytes(stats.totalBytes - stats.indexesBytes)}</span>
            </div>
            <Progress value={((stats.totalBytes - stats.indexesBytes) / stats.totalBytes) * 100} className="h-2" />
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-sm">
              <span>Indexes</span>
              <span className="text-muted-foreground">{formatBytes(stats.indexesBytes)}</span>
            </div>
            <Progress value={(stats.indexesBytes / stats.totalBytes) * 100} className="h-2" />
          </div>
          {stats.toastBytes > 0 && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <span>TOAST</span>
                <span className="text-muted-foreground">{formatBytes(stats.toastBytes)}</span>
              </div>
              <Progress value={(stats.toastBytes / stats.totalBytes) * 100} className="h-2" />
            </div>
          )}
        </CardContent>
      </Card>

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
                <TableRow style={{ gridTemplateColumns: 'minmax(150px, 2fr) minmax(120px, 2fr) 80px 60px 80px 80px' }}>
                  <TableHead>Name</TableHead>
                  <TableHead>Columns</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Scans</TableHead>
                  <TableHead>Usage</TableHead>
                  <TableHead>Type</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {indexStats.map((idx) => (
                  <TableRow
                    key={idx.name}
                    style={{ gridTemplateColumns: 'minmax(150px, 2fr) minmax(120px, 2fr) 80px 60px 80px 80px' }}
                  >
                    <TableCell className="font-mono text-sm truncate min-w-0" title={idx.name}>
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
                    <TableCell>{formatBytes(idx.sizeBytes)}</TableCell>
                    <TableCell>{formatNumber(idx.scans)}</TableCell>
                    <TableCell>
                      {idx.usagePercent > 0 ? (
                        <span className={idx.usagePercent < 10 ? 'text-destructive' : ''}>
                          {idx.usagePercent.toFixed(1)}%
                        </span>
                      ) : (
                        <Badge variant="destructive" className="text-xs">
                          Unused
                        </Badge>
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
              <p className="text-sm text-muted-foreground">{stats.lastVacuum || stats.lastAutovacuum || 'Never'}</p>
              <p className="text-xs text-muted-foreground">
                Total: {stats.vacuumCount} manual, {stats.autovacuumCount} auto
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Last Analyze</h4>
              <p className="text-sm text-muted-foreground">{stats.lastAnalyze || stats.lastAutoanalyze || 'Never'}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
