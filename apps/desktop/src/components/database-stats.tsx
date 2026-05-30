import { useState } from 'react';
import { formatBytes, formatNumber } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Server, Users, RefreshCw, AlertTriangle, Clock, Radio, Loader2, Copy, Check } from 'lucide-react';
import { useDatabaseSizes } from '@/hooks/use-schema';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

type DatabaseStatsProps = {
  connectionId: string;
};

export function DatabaseStats({ connectionId }: DatabaseStatsProps) {
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
    <div className="p-4 space-y-4">
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
                <table className="w-full text-xs table-fixed" style={{ minWidth: 640 }}>
                  <thead className="sticky top-0 z-10 bg-muted/50">
                    <tr>
                      <th className="px-3 py-2 font-medium text-muted-foreground text-left" style={{ width: 60 }}>
                        PID
                      </th>
                      <th className="px-3 py-2 font-medium text-muted-foreground text-left" style={{ width: 80 }}>
                        User
                      </th>
                      <th className="px-3 py-2 font-medium text-muted-foreground text-left" style={{ width: 100 }}>
                        Application
                      </th>
                      <th className="px-3 py-2 font-medium text-muted-foreground text-left" style={{ width: 80 }}>
                        Client
                      </th>
                      <th className="px-3 py-2 font-medium text-muted-foreground text-left" style={{ width: 80 }}>
                        State
                      </th>
                      <th className="px-3 py-2 font-medium text-muted-foreground text-left">Query</th>
                      <th className="px-3 py-2 font-medium text-muted-foreground text-left" style={{ width: 80 }}>
                        Duration
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {connections && connections.length > 0 ? (
                      connections.map((conn) => (
                        <tr key={conn.pid} className="border-b last:border-b-0 even:bg-muted/20 hover:bg-muted/30">
                          <td className="px-3 py-2 font-mono text-xs truncate" title={String(conn.pid)}>
                            {conn.pid}
                          </td>
                          <td className="px-3 py-2 text-sm truncate" title={conn.usename}>
                            {conn.usename}
                          </td>
                          <td
                            className="px-3 py-2 text-sm text-muted-foreground truncate"
                            title={conn.applicationName || '-'}
                          >
                            {conn.applicationName || '-'}
                          </td>
                          <td
                            className="px-3 py-2 text-sm text-muted-foreground truncate"
                            title={conn.clientAddr || 'local'}
                          >
                            {conn.clientAddr || 'local'}
                          </td>
                          <td className="px-3 py-2">
                            <Badge
                              variant={getStateColor(conn.state) as 'default' | 'secondary' | 'outline' | 'destructive'}
                            >
                              {conn.state}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 text-sm group" title={conn.query || '-'}>
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
                                    <Check className="size-3 text-green-500" />
                                  ) : (
                                    <Copy className="size-3" />
                                  )}
                                </Button>
                              )}
                            </div>
                          </td>
                          <td
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
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="text-center text-muted-foreground py-8">
                          No active connections
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
