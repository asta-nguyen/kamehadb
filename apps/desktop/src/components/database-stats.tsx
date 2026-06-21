import { useState } from 'react';
import type { ComponentType } from 'react';
import { formatBytes, formatNumber } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Spinner } from '@/components/ui/spinner';
import {
  Server,
  Users,
  RefreshCw,
  AlertTriangle,
  Clock,
  Radio,
  Copy,
  Check,
  Database,
  Gauge,
  HardDrive,
  KeyRound,
  TerminalSquare,
  Timer,
} from 'lucide-react';
import { useDatabaseSizes } from '@/hooks/use-schema';
import { useRedisStats } from '@/hooks/use-redis';
import { useConnections } from '@/hooks/use-connections';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DataTable, type ColumnDef } from '@/components/data-table';
import type { ConnectionInfo } from '@kamehadb/shared';

type DatabaseStatsProps = {
  connectionId: string;
};

function getStateColor(state: string) {
  switch (state) {
    case 'active':
      return 'default';
    case 'idle':
      return 'secondary';
    case 'idle in transaction':
      return 'outline';
    default:
      return 'outline';
  }
}

export function DatabaseStats({ connectionId }: DatabaseStatsProps) {
  const { data: connections, isLoading: connectionsLoading } = useConnections();
  const currentConnection = connections?.find((conn) => conn.id === connectionId);

  if (connectionsLoading && !currentConnection) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!currentConnection) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground gap-2">
        <AlertTriangle className="size-5" />
        <span className="text-sm">Connection not found</span>
      </div>
    );
  }

  if (currentConnection.kind === 'redis') {
    return <RedisDatabaseStats connectionId={connectionId} />;
  }

  if (
    currentConnection.kind === 'postgres' ||
    currentConnection.kind === 'mysql' ||
    currentConnection.kind === 'mariadb' ||
    currentConnection.kind === 'sqlite' ||
    currentConnection.kind === 'sqlserver' ||
    currentConnection.kind === 'oracle' ||
    currentConnection.kind === 'clickhouse' ||
    currentConnection.kind === 'duckdb'
  ) {
    return <SqlDatabaseStats connectionId={connectionId} />;
  }

  return (
    <div className="flex items-center justify-center h-full text-muted-foreground gap-2">
      <AlertTriangle className="size-5" />
      <span className="text-sm">Unsupported database kind</span>
    </div>
  );
}

function SqlDatabaseStats({ connectionId }: DatabaseStatsProps) {
  const [copiedPid, setCopiedPid] = useState<number | null>(null);

  const handleCopyQuery = async (pid: number, query: string) => {
    try {
      await navigator.clipboard.writeText(query);
      setCopiedPid(pid);
      setTimeout(() => setCopiedPid(null), 1500);
    } catch {
      setCopiedPid(null);
    }
  };

  const {
    data: sizes,
    isLoading: sizesLoading,
    error: sizesError,
    refetch: refetchSizes,
  } = useDatabaseSizes(connectionId);

  const {
    data: connections,
    isLoading: connsLoading,
    error: connsError,
    refetch: refetchConns,
  } = useQuery({
    queryKey: ['active-connections', connectionId],
    queryFn: () => api.getActiveConnections(connectionId),
    staleTime: 10000,
  });

  const totalSize = sizes?.reduce((acc, s) => acc + s.totalBytes, 0) ?? 0;

  const connColumns: ColumnDef<ConnectionInfo>[] = [
    { id: 'pid', header: 'PID', accessor: (c) => c.pid },
    { id: 'usename', header: 'User', accessor: (c) => c.usename },
    { id: 'applicationName', header: 'Application', accessor: (c) => c.applicationName || '-' },
    { id: 'clientAddr', header: 'Client', accessor: (c) => c.clientAddr || 'local' },
    {
      id: 'state',
      header: 'State',
      accessor: (c) => c.state,
      render: (value: unknown) => (
        <Badge variant={getStateColor(value as string) as 'default' | 'secondary' | 'outline' | 'destructive'}>
          {value as string}
        </Badge>
      ),
    },
    {
      id: 'query',
      header: 'Query',
      accessor: (c) => c.query || '-',
      render: (value: unknown, row: ConnectionInfo) => (
        <div className="flex items-center gap-1">
          <span className="min-w-0 truncate">{value as string}</span>
          {row.query && (
            <Button
              variant="ghost"
              size="icon"
              className="opacity-0 shrink-0 size-5 focus-visible:opacity-100 group-hover:opacity-100"
              onClick={() => handleCopyQuery(row.pid, row.query!)}
              title="Copy query"
              aria-label="Copy query"
            >
              {copiedPid === row.pid ? <Check className="text-primary size-3" /> : <Copy className="size-3" />}
            </Button>
          )}
        </div>
      ),
    },
    {
      id: 'durationSeconds',
      header: 'Duration',
      accessor: (c) => c.durationSeconds,
      render: (value: unknown) => {
        const secs = value as number;
        return secs > 0 ? <span className={secs > 60 ? 'text-destructive' : ''}>{secs}s</span> : '-';
      },
    },
  ];

  return (
    <div className="p-4 h-full overflow-y-auto space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Database Analytics</h2>
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" onClick={() => refetchSizes()} title="Refresh sizes">
            <RefreshCw className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => refetchConns()} title="Refresh connections">
            <Users className="size-4" />
          </Button>
        </div>
      </div>

      <Tabs defaultValue="sizes">
        <TabsList>
          <TabsTrigger value="sizes">Size Explorer</TabsTrigger>
          <TabsTrigger value="connections">Connections</TabsTrigger>
        </TabsList>

        <TabsContent value="sizes" className="mt-4 space-y-4">
          {/* Summary Card */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-4">
              <div className="space-y-1">
                <CardTitle className="flex items-center text-base gap-2">
                  <Server className="size-4" />
                  Database Size
                </CardTitle>
                <CardDescription>Total size across all tables</CardDescription>
              </div>
              <div className="text-2xl font-bold">{formatBytes(totalSize)}</div>
            </CardHeader>
          </Card>

          {/* Tables List */}
          {sizesLoading ? (
            <Card className="flex items-center justify-center h-48">
              <Spinner size="lg" />
            </Card>
          ) : sizesError ? (
            <Card className="flex items-center justify-center h-48 text-muted-foreground">
              <AlertTriangle className="mr-2 size-5" />
              Failed to load sizes
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-base">Tables by Size</CardTitle>
                <CardDescription>{sizes?.length || 0} tables, sorted by total size</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                {sizes && sizes.length > 0 ? (
                  <div className="space-y-4">
                    {sizes.slice(0, 20).map((table, idx) => {
                      const percent = (table.totalBytes / totalSize) * 100;
                      return (
                        <div key={`${table.schema}.${table.table}`} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="w-5 text-muted-foreground text-xs">{idx + 1}.</span>
                              <span className="text-sm font-mono">
                                {table.schema}.{table.table}
                              </span>
                              {table.rowEstimate > 0 && (
                                <span className="text-muted-foreground text-xs">
                                  (~{formatNumber(table.rowEstimate)} rows)
                                </span>
                              )}
                            </div>
                            <div className="flex items-center text-sm gap-3">
                              <span className="text-muted-foreground">{formatBytes(table.sizeBytes)} data</span>
                              <span className="text-muted-foreground">+{formatBytes(table.indexBytes)} idx</span>
                              <span className="font-medium">{formatBytes(table.totalBytes)}</span>
                            </div>
                          </div>
                          <Progress value={percent} className="h-1.5" />
                        </div>
                      );
                    })}
                    {sizes.length > 20 && (
                      <p className="py-2 text-center text-sm">Showing top 20 of {sizes.length} tables</p>
                    )}
                  </div>
                ) : (
                  <p className="py-8 text-center text-sm">No tables found</p>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="connections" className="mt-4 space-y-4">
          {/* Summary Card */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-4">
              <CardTitle className="flex items-center text-base gap-2">
                <Users className="size-4" />
                Active Connections
              </CardTitle>
              <Badge variant="outline">{connections?.length || 0} total</Badge>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-3 gap-4">
                <div className="flex items-center p-3 bg-muted/50 rounded-lg gap-2">
                  <Radio className="text-primary size-4" />
                  <span className="text-sm">{connections?.filter((c) => c.state === 'active').length || 0} active</span>
                </div>
                <div className="flex items-center p-3 bg-muted/50 rounded-lg gap-2">
                  <Clock className="text-muted-foreground size-4" />
                  <span className="text-sm">{connections?.filter((c) => c.state === 'idle').length || 0} idle</span>
                </div>
                <div className="flex items-center p-3 bg-muted/50 rounded-lg gap-2">
                  <AlertTriangle className="text-destructive size-4" />
                  <span className="text-sm">
                    {connections?.filter((c) => c.state === 'idle in transaction').length || 0} in transaction
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Connections Table */}
          {connsLoading ? (
            <Card className="flex items-center justify-center h-64">
              <Spinner size="lg" />
            </Card>
          ) : connsError ? (
            <Card className="flex items-center justify-center h-64 text-muted-foreground">
              <AlertTriangle className="mr-2 size-5" />
              Failed to load connections
            </Card>
          ) : (
            <Card className="overflow-auto">
              <DataTable<ConnectionInfo> rows={connections ?? []} rowKey={(c) => String(c.pid)} columns={connColumns} />
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RedisDatabaseStats({ connectionId }: DatabaseStatsProps) {
  const { data: stats, isLoading, error, refetch, isFetching } = useRedisStats(connectionId);

  const memoryPercent = stats?.maxMemory ? Math.min((stats.usedMemory / stats.maxMemory) * 100, 100) : undefined;
  const peakPercent = stats?.usedMemoryPeak ? Math.min((stats.usedMemory / stats.usedMemoryPeak) * 100, 100) : 0;

  return (
    <div className="p-4 h-full overflow-y-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Redis Analytics</h2>
          <p className="text-muted-foreground text-sm">Runtime stats, memory, keyspace, and command activity</p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => refetch()} title="Refresh Redis stats" disabled={isFetching}>
          <RefreshCw className={`size-4 ${isFetching ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {isLoading ? (
        <Card className="flex items-center justify-center h-64">
          <Spinner size="lg" />
        </Card>
      ) : error ? (
        <Card className="flex items-center justify-center h-64 text-muted-foreground">
          <AlertTriangle className="mr-2 size-5" />
          Failed to load Redis stats
        </Card>
      ) : stats ? (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              icon={Database}
              label="Server"
              value={`Redis ${stats.version}`}
              description={`${formatDuration(stats.uptimeSeconds)} uptime`}
            />
            <MetricCard
              icon={KeyRound}
              label="Keys"
              value={formatNumber(stats.totalKeys)}
              description={`${formatNumber(stats.expiringKeys)} expiring`}
            />
            <MetricCard
              icon={HardDrive}
              label="Memory"
              value={formatBytes(stats.usedMemory)}
              description={`${formatBytes(stats.usedMemoryPeak)} peak`}
            />
            <MetricCard
              icon={Users}
              label="Clients"
              value={formatNumber(stats.connectedClients)}
              description={`${formatNumber(stats.blockedClients)} blocked`}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center text-base gap-2">
                  <HardDrive className="size-4" />
                  Memory Usage
                </CardTitle>
                <CardDescription>
                  {stats.maxMemory ? 'Current usage against configured maxmemory' : 'Current usage compared with peak'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Used</span>
                    <span className="font-medium">{formatBytes(stats.usedMemory)}</span>
                  </div>
                  <Progress value={memoryPercent ?? peakPercent} className="h-2" />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <div className="text-muted-foreground text-xs">Peak memory</div>
                    <div className="mt-1 text-sm font-mono">{formatBytes(stats.usedMemoryPeak)}</div>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <div className="text-muted-foreground text-xs">Max memory</div>
                    <div className="mt-1 text-sm font-mono">
                      {stats.maxMemory && stats.maxMemory > 0 ? formatBytes(stats.maxMemory) : 'No limit'}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center text-base gap-2">
                  <Gauge className="size-4" />
                  Cache Health
                </CardTitle>
                <CardDescription>Hit-rate and key expiration overview</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Hit rate</span>
                    <span className="font-medium">
                      {stats.hitRate === undefined ? 'n/a' : `${stats.hitRate.toFixed(1)}%`}
                    </span>
                  </div>
                  <Progress value={stats.hitRate ?? 0} className="h-2" />
                </div>
                <div className="grid gap-3 lg:grid-cols-1 sm:grid-cols-2">
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <div className="text-muted-foreground text-xs">Expiring keys</div>
                    <div className="mt-1 text-sm font-mono">{formatNumber(stats.expiringKeys)}</div>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <div className="text-muted-foreground text-xs">Average TTL</div>
                    <div className="mt-1 text-sm font-mono">{formatMilliseconds(stats.avgTtl)}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center text-base gap-2">
                <TerminalSquare className="size-4" />
                Activity
              </CardTitle>
              <CardDescription>Command and connection counters reported by Redis INFO</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center text-muted-foreground text-xs gap-2">
                    <TerminalSquare className="size-3.5" />
                    Commands processed
                  </div>
                  <div className="mt-1 text-lg font-mono">{formatNumber(stats.totalCommands)}</div>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center text-muted-foreground text-xs gap-2">
                    <Users className="size-3.5" />
                    Connections received
                  </div>
                  <div className="mt-1 text-lg font-mono">{formatNumber(stats.totalConnections)}</div>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center text-muted-foreground text-xs gap-2">
                    <Timer className="size-3.5" />
                    Uptime
                  </div>
                  <div className="mt-1 text-lg font-mono">{formatDuration(stats.uptimeSeconds)}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card className="flex items-center justify-center h-64 text-muted-foreground">No Redis stats available</Card>
      )}
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  description,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  description: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center text-muted-foreground text-sm font-medium gap-2">
          <Icon className="size-4" />
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-mono font-semibold truncate" title={value}>
          {value}
        </div>
        <p className="mt-1 text-muted-foreground text-xs">{description}</p>
      </CardContent>
    </Card>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function formatMilliseconds(ms: number): string {
  if (ms <= 0) return 'n/a';
  if (ms < 1000) return `${ms}ms`;
  return formatDuration(Math.round(ms / 1000));
}
