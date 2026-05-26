import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatBytes, formatNumber } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Server, Users, RefreshCw, AlertTriangle, Clock, Radio, Loader2 } from 'lucide-react';

type DatabaseStatsProps = {
  connectionId: string;
};

export function DatabaseStats({ connectionId }: DatabaseStatsProps) {
  const [selectedSchema] = useState<string | undefined>();

  const {
    data: sizes,
    isLoading: sizesLoading,
    error: sizesError,
    refetch: refetchSizes,
  } = useQuery({
    queryKey: ['database-sizes', connectionId, selectedSchema],
    queryFn: () => api.getDatabaseSizes(connectionId, selectedSchema),
  });

  const {
    data: connections,
    isLoading: connsLoading,
    error: connsError,
    refetch: refetchConns,
  } = useQuery({
    queryKey: ['active-connections', connectionId],
    queryFn: () => api.getActiveConnections(connectionId),
    refetchInterval: 10000,
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
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Database Analytics</h2>
        <div className="flex gap-2">
          <button
            onClick={() => refetchSizes()}
            className="p-2 hover:bg-muted rounded-md transition-colors"
            title="Refresh sizes"
          >
            <RefreshCw className="size-4" />
          </button>
          <button
            onClick={() => refetchConns()}
            className="p-2 hover:bg-muted rounded-md transition-colors"
            title="Refresh connections"
          >
            <Users className="size-4" />
          </button>
        </div>
      </div>

      <Tabs defaultValue="sizes">
        <TabsList>
          <TabsTrigger value="sizes">Size Explorer</TabsTrigger>
          <TabsTrigger value="connections">Connections</TabsTrigger>
        </TabsList>

        <TabsContent value="sizes" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Server className="size-4" />
                  Database Size
                </CardTitle>
                <CardDescription>Total size across all tables</CardDescription>
              </div>
              <div className="text-2xl font-bold">{formatBytes(totalSize)}</div>
            </CardHeader>
          </Card>

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
              <CardHeader>
                <CardTitle className="text-base">Tables by Size</CardTitle>
                <CardDescription>{sizes?.length || 0} tables, sorted by total size</CardDescription>
              </CardHeader>
              <CardContent>
                {sizes && sizes.length > 0 ? (
                  <div className="space-y-3">
                    {sizes.slice(0, 20).map((table, idx) => {
                      const percent = (table.totalBytes / totalSize) * 100;
                      return (
                        <div key={`${table.schema}.${table.table}`} className="space-y-1">
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

        <TabsContent value="connections" className="mt-4">
          <Card className="mb-4">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="size-4" />
                Active Connections
              </CardTitle>
              <Badge variant="outline">{connections?.length || 0} total</Badge>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="flex items-center gap-2">
                  <Radio className="size-4 text-green-500" />
                  <span className="text-sm">{connections?.filter((c) => c.state === 'active').length || 0} active</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="size-4 text-yellow-500" />
                  <span className="text-sm">{connections?.filter((c) => c.state === 'idle').length || 0} idle</span>
                </div>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="size-4 text-destructive" />
                  <span className="text-sm">
                    {connections?.filter((c) => c.state === 'idle in transaction').length || 0} in transaction
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

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
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
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
                        <TableRow key={conn.pid}>
                          <TableCell className="font-mono text-xs">{conn.pid}</TableCell>
                          <TableCell className="text-sm">{conn.usename}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{conn.applicationName || '-'}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{conn.clientAddr || 'local'}</TableCell>
                          <TableCell>
                            <Badge
                              variant={getStateColor(conn.state) as 'default' | 'secondary' | 'outline' | 'destructive'}
                            >
                              {conn.state}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-xs truncate text-sm">{conn.query || '-'}</TableCell>
                          <TableCell className="text-sm">
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
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          No active connections
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
