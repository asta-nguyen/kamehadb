import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, Camera, GitCompare, Loader2, Terminal } from 'lucide-react';
import type { SchemaDiffInput, SchemaTableDiff } from '@kamehadb/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { QUERY_KEYS } from '@/lib/query-keys';
import { useCaptureSchemaSnapshot, useSchemaDiff, useSchemaSnapshots } from '@/hooks/use-schema-changelog';
import { openMigrationTab } from '@/store';
import { SchemaDiffTableCard } from './schema-diff-table-card';
import { toast } from 'sonner';

type DiffFilter = 'all' | 'tables' | 'columns' | 'indexes';

function filterTableDiffs(tableDiffs: readonly SchemaTableDiff[], filter: DiffFilter): readonly SchemaTableDiff[] {
  if (filter === 'all') return tableDiffs;
  if (filter === 'tables') return tableDiffs.filter((diff) => diff.type === 'added' || diff.type === 'removed');
  if (filter === 'columns') return tableDiffs.filter((diff) => diff.type === 'changed' && diff.columnDiffs.length > 0);
  return tableDiffs.filter((diff) => diff.type === 'changed' && diff.indexDiffs.length > 0);
}

export function SchemaDiffView({ connectionId }: { readonly connectionId: string }) {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useSchemaSnapshots(connectionId);
  const { mutateAsync: captureSnapshot, isPending: isCapturing } = useCaptureSchemaSnapshot();
  const [fromSnapshotId, setFromSnapshotId] = useState('');
  const [toSnapshotId, setToSnapshotId] = useState('');
  const [filter, setFilter] = useState<DiffFilter>('all');
  const snapshots = data?.snapshots ?? [];

  useEffect(() => {
    if (snapshots.length < 2 || (fromSnapshotId && toSnapshotId)) return;
    setFromSnapshotId(snapshots[snapshots.length - 2].id);
    setToSnapshotId(snapshots[snapshots.length - 1].id);
  }, [fromSnapshotId, snapshots, toSnapshotId]);

  const input = useMemo<SchemaDiffInput | null>(() => {
    if (!fromSnapshotId || !toSnapshotId) return null;
    return { fromSnapshotId, toSnapshotId };
  }, [fromSnapshotId, toSnapshotId]);
  const diffQuery = useSchemaDiff(connectionId, input);
  const filteredTableDiffs = filterTableDiffs(diffQuery.data?.tableDiffs ?? [], filter);

  const handleFromChange = (value: string | null) => {
    if (value !== null) setFromSnapshotId(value);
  };

  const handleToChange = (value: string | null) => {
    if (value !== null) setToSnapshotId(value);
  };

  const handleCapture = async () => {
    try {
      await captureSnapshot(connectionId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SCHEMA_SNAPSHOTS(connectionId) }),
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SCHEMA_CHANGELOG(connectionId) }),
      ]);
      toast.success('Schema snapshot captured');
    } catch (captureError) {
      toast.error(captureError instanceof Error ? captureError.message : 'Capture failed');
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <GitCompare className="size-4" />
          Schema Diff
        </h2>
        <Button size="sm" className="gap-1.5 text-xs" onClick={handleCapture} disabled={isCapturing}>
          {isCapturing ? <Loader2 className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />}
          {isCapturing ? 'Capturing...' : 'Capture Current Snapshot'}
        </Button>
      </div>

      {error && (
        <div className="text-sm text-destructive">
          {error instanceof Error ? error.message : 'Failed to load snapshots'}
        </div>
      )}

      {isLoading ? (
        <Card>
          <CardContent className="flex justify-center pt-6 pb-6">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : snapshots.length < 2 ? (
        <Card>
          <CardContent className="pt-6 pb-6 text-center text-sm text-muted-foreground">
            Capture at least two snapshots before comparing schema states.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <ArrowLeftRight className="size-3.5" />
                Compare snapshots
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <div className="text-xs text-muted-foreground">From</div>
                  <Select value={fromSnapshotId} onValueChange={handleFromChange}>
                    <SelectTrigger className="text-xs h-8">
                      <SelectValue placeholder="Select snapshot" />
                    </SelectTrigger>
                    <SelectContent>
                      {snapshots.map((snapshot) => (
                        <SelectItem key={snapshot.id} value={snapshot.id} className="text-xs font-mono">
                          {new Date(snapshot.capturedAt).toLocaleString()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <div className="text-xs text-muted-foreground">To</div>
                  <Select value={toSnapshotId} onValueChange={handleToChange}>
                    <SelectTrigger className="text-xs h-8">
                      <SelectValue placeholder="Select snapshot" />
                    </SelectTrigger>
                    <SelectContent>
                      {snapshots.map((snapshot) => (
                        <SelectItem key={snapshot.id} value={snapshot.id} className="text-xs font-mono">
                          {new Date(snapshot.capturedAt).toLocaleString()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {(['all', 'tables', 'columns', 'indexes'] as const).map((value) => (
                  <Button
                    key={value}
                    size="sm"
                    variant={filter === value ? 'default' : 'outline'}
                    className="text-xs"
                    onClick={() => setFilter(value)}
                  >
                    {value}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {diffQuery.isLoading ? (
            <Card>
              <CardContent className="flex justify-center pt-6 pb-6">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </CardContent>
            </Card>
          ) : diffQuery.error ? (
            <div className="text-sm text-destructive">
              {diffQuery.error instanceof Error ? diffQuery.error.message : 'Failed to load diff'}
            </div>
          ) : diffQuery.data ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Card>
                  <CardContent className="py-4">
                    <div className="text-xs text-muted-foreground">Tables</div>
                    <div className="mt-1 text-lg font-semibold">
                      {diffQuery.data.stats.tableAdds +
                        diffQuery.data.stats.tableRemovals +
                        diffQuery.data.stats.tableChanges}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="py-4">
                    <div className="text-xs text-muted-foreground">Columns</div>
                    <div className="mt-1 text-lg font-semibold">
                      {diffQuery.data.stats.columnAdds +
                        diffQuery.data.stats.columnRemovals +
                        diffQuery.data.stats.columnChanges}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="py-4">
                    <div className="text-xs text-muted-foreground">Indexes</div>
                    <div className="mt-1 text-lg font-semibold">
                      {diffQuery.data.stats.indexAdds +
                        diffQuery.data.stats.indexRemovals +
                        diffQuery.data.stats.indexChanges}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="py-4">
                    <div className="text-xs text-muted-foreground">Total</div>
                    <div className="mt-1 text-lg font-semibold">{diffQuery.data.stats.totalChanges}</div>
                  </CardContent>
                </Card>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline">{new Date(diffQuery.data.fromSnapshot.capturedAt).toLocaleString()}</Badge>
                  <span>→</span>
                  <Badge variant="outline">{new Date(diffQuery.data.toSnapshot.capturedAt).toLocaleString()}</Badge>
                </div>
                <Button
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  onClick={() => openMigrationTab(connectionId, fromSnapshotId, toSnapshotId)}
                >
                  <Terminal className="size-3.5" />
                  Generate Migration SQL
                </Button>
              </div>
              {filteredTableDiffs.length === 0 ? (
                <Card>
                  <CardContent className="pt-6 pb-6 text-center text-sm text-muted-foreground">
                    No changes match the current filter.
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {filteredTableDiffs.map((tableDiff) => (
                    <SchemaDiffTableCard key={tableDiff.tableId} tableDiff={tableDiff} />
                  ))}
                </div>
              )}
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
