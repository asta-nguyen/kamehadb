import { useState } from 'react';
import type { ComponentType } from 'react';
import { formatBytes, formatNumber } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Server,
  Users,
  RefreshCw,
  AlertTriangle,
  Clock,
  Radio,
  Loader2,
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

type DatabaseStatsProps = {
  connectionId: string;
};

export function DatabaseStats({ connectionId }: DatabaseStatsProps) {
  const { data: connections, isLoading: connectionsLoading } = useConnections();
  const currentConnection = connections?.find((conn) => conn.id === connectionId);

  if (connectionsLoading && !currentConnection) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!currentConnection) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
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
    currentConnection.kind === 'sqlite'
  ) {
    return <SqlDatabaseStats connectionId={connectionId} />;
  }

  return (
    <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
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

  const getStateColor = (state: string) => {
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
  };

  return (
    <div className="h-full space-y-4 overflow-y-auto p-4">
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
                <CardTitle className="text-base flex items-center gap-2">
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
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </Card>
          ) : sizesError ? (
            <Card className="flex items-center justify-center h-48 text-muted-foreground">
              <AlertTriangle className="size-5 mr-2" />
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
                              <span className="text-xs text-muted-foreground w-5">{idx + 1}.</span>
                              <span className="font-mono text-sm">
                                {table.schema}.{table.table}
                              </span>
                              {table.rowEstimate > 0 && (
                                <span className="text-xs text-muted-foreground">
                                  (~{formatNumber(table.rowEstimate)} rows)
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-sm">
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
                      <p className="text-sm text-muted-foreground text-center py-2">
                        Showing top 20 of {sizes.length} tables
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">No tables found</p>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="connections" className="mt-4 space-y-4">
          {/* Summary Card */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="size-4" />
                Active Connections
              </CardTitle>
              <Badge variant="outline">{connections?.length || 0} total</Badge>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid gap-4 grid-cols-3">
                <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                  <Radio className="size-4 text-primary" />
                  <span className="text-sm">{connections?.filter((c) => c.state === 'active').length || 0} active</span>
                </div>
                <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                  <Clock className="size-4 text-muted-foreground" />
                  <span className="text-sm">{connections?.filter((c) => c.state === 'idle').length || 0} idle</span>
                </div>
                <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                  <AlertTriangle className="size-4 text-destructive" />
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
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </Card>
          ) : connsError ? (
            <Card className="flex items-center justify-center h-64 text-muted-foreground">
              <AlertTriangle className="size-5 mr-2" />
              Failed to load connections
            </Card>
          ) : (
            <Card>
              <div className="border-t overflow-auto bg-background">
                <Table className="text-xs" style={{ minWidth: 640 }}>
                  <TableHeader className="sticky top-0 z-10 bg-muted/50">
                    <TableRow style={{ gridTemplateColumns: '60px 80px 100px 80px 80px minmax(160px, 1fr) 80px' }}>
                      <TableHead>PID</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Application</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead>Query</TableHead>
                      <TableHead>Duration</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {connections && connections.length > 0 ? (
                      connections.map((conn) => (
                        <TableRow
                          key={conn.pid}
                          style={{ gridTemplateColumns: '60px 80px 100px 80px 80px minmax(160px, 1fr) 80px' }}
                          className="even:bg-muted/20 hover:bg-muted/30"
                        >
                          <TableCell className="px-3 py-2 font-mono text-xs truncate" title={String(conn.pid)}>
                            {conn.pid}
                          </TableCell>
                          <TableCell className="px-3 py-2 text-sm truncate" title={conn.usename}>
                            {conn.usename}
                          </TableCell>
                          <TableCell
                            className="px-3 py-2 text-sm text-muted-foreground truncate"
                            title={conn.applicationName || '-'}
                          >
                            {conn.applicationName || '-'}
                          </TableCell>
                          <TableCell
                            className="px-3 py-2 text-sm text-muted-foreground truncate"
                            title={conn.clientAddr || 'local'}
                          >
                            {conn.clientAddr || 'local'}
                          </TableCell>
                          <TableCell className="px-3 py-2">
                            <Badge
                              variant={getStateColor(conn.state) as 'default' | 'secondary' | 'outline' | 'destructive'}
                            >
                              {conn.state}
                            </Badge>
                          </TableCell>
                          <TableCell className="px-3 py-2 text-sm group" title={conn.query || '-'}>
                            <div className="flex items-center gap-1">
                              <span className="truncate min-w-0">{conn.query || '-'}</span>
                              {conn.query && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-5 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                                  onClick={() => handleCopyQuery(conn.pid, conn.query!)}
                                  title="Copy query"
                                  aria-label="Copy query"
                                >
                                  {copiedPid === conn.pid ? (
                                    <Check className="size-3 text-primary" />
                                  ) : (
                                    <Copy className="size-3" />
                                  )}
                                </Button>
                              )}
                            </div>
                          </TableCell>
                          <TableCell
                            className="px-3 py-2 text-sm truncate"
                            title={conn.durationSeconds > 0 ? `${conn.durationSeconds}s` : '-'}
                          >
                            {conn.durationSeconds > 0 ? (
                              <span className={conn.durationSeconds > 60 ? 'text-destructive' : ''}>
                                {conn.durationSeconds}s
                              </span>
                            ) : (
                              '-'
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow style={{ gridTemplateColumns: '60px 80px 100px 80px 80px minmax(160px, 1fr) 80px' }}>
                        <TableCell colSpan={7} className="px-3 text-center text-muted-foreground py-8">
                          No active connections
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
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
    <div className="h-full space-y-4 overflow-y-auto p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Redis Analytics</h2>
          <p className="text-sm text-muted-foreground">Runtime stats, memory, keyspace, and command activity</p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => refetch()} title="Refresh Redis stats" disabled={isFetching}>
          <RefreshCw className={`size-4 ${isFetching ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {isLoading ? (
        <Card className="flex h-64 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </Card>
      ) : error ? (
        <Card className="flex h-64 items-center justify-center text-muted-foreground">
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
                <CardTitle className="flex items-center gap-2 text-base">
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
                  <div className="rounded-lg bg-muted/50 p-3">
                    <div className="text-xs text-muted-foreground">Peak memory</div>
                    <div className="mt-1 font-mono text-sm">{formatBytes(stats.usedMemoryPeak)}</div>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3">
                    <div className="text-xs text-muted-foreground">Max memory</div>
                    <div className="mt-1 font-mono text-sm">
                      {stats.maxMemory && stats.maxMemory > 0 ? formatBytes(stats.maxMemory) : 'No limit'}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
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
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                  <div className="rounded-lg bg-muted/50 p-3">
                    <div className="text-xs text-muted-foreground">Expiring keys</div>
                    <div className="mt-1 font-mono text-sm">{formatNumber(stats.expiringKeys)}</div>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3">
                    <div className="text-xs text-muted-foreground">Average TTL</div>
                    <div className="mt-1 font-mono text-sm">{formatMilliseconds(stats.avgTtl)}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TerminalSquare className="size-4" />
                Activity
              </CardTitle>
              <CardDescription>Command and connection counters reported by Redis INFO</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg bg-muted/50 p-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <TerminalSquare className="size-3.5" />
                    Commands processed
                  </div>
                  <div className="mt-1 font-mono text-lg">{formatNumber(stats.totalCommands)}</div>
                </div>
                <div className="rounded-lg bg-muted/50 p-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Users className="size-3.5" />
                    Connections received
                  </div>
                  <div className="mt-1 font-mono text-lg">{formatNumber(stats.totalConnections)}</div>
                </div>
                <div className="rounded-lg bg-muted/50 p-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Timer className="size-3.5" />
                    Uptime
                  </div>
                  <div className="mt-1 font-mono text-lg">{formatDuration(stats.uptimeSeconds)}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card className="flex h-64 items-center justify-center text-muted-foreground">No Redis stats available</Card>
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
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Icon className="size-4" />
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="truncate font-mono text-2xl font-semibold" title={value}>
          {value}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
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
