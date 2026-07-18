import {
  useSchemaChangelog,
  useCaptureSchemaSnapshot,
  useSchemaSnapshots,
  useSchemaWatcherStatus,
  useStartSchemaWatcher,
  useStopSchemaWatcher,
  useStartSchemaNotifyWatcher,
  useStopSchemaNotifyWatcher,
} from '@/hooks/use-schema-changelog';
import { useConnections } from '@/hooks/use-connections';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { isSqlKind } from '@/lib/constants';
import { Camera, Clock, GitCompare, History, Plus, Minus, Pencil, Radio } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { useState } from 'react';
import { KIND, type SchemaChangeDescriptor, type SchemaSnapshotSource, safeErrorMessage } from '@kamehadb/shared';
import { useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/lib/query-keys';
import { openSchemaDiffTab } from '@/store';
import { toastError, toastSuccess } from '@/lib/toast';
import { appendFrontendLog } from '@/lib/app-logs';
import { useAutoCaptureInvalidation } from '@/hooks/use-auto-capture-invalidation';

const CHANGE_ICONS: Record<SchemaChangeDescriptor['type'], typeof Plus> = {
  table_added: Plus,
  table_removed: Minus,
  column_added: Plus,
  column_removed: Minus,
  column_changed: Pencil,
  index_added: Plus,
  index_removed: Minus,
};

const CHANGE_COLORS: Record<SchemaChangeDescriptor['type'], string> = {
  table_added: 'text-green-600',
  table_removed: 'text-red-600',
  column_added: 'text-green-600',
  column_removed: 'text-red-600',
  column_changed: 'text-yellow-600',
  index_added: 'text-blue-600',
  index_removed: 'text-orange-600',
};

const INTERVAL_PRESETS = [
  { label: '5 minutes', value: 5 * 60 * 1000 },
  { label: '15 minutes', value: 15 * 60 * 1000 },
  { label: '30 minutes', value: 30 * 60 * 1000 },
  { label: '1 hour', value: 60 * 60 * 1000 },
  { label: '6 hours', value: 6 * 60 * 60 * 1000 },
] as const;

function DescribeChange({ change }: { change: SchemaChangeDescriptor }) {
  switch (change.type) {
    case 'table_added':
      return (
        <span>
          Table <code className="font-mono text-xs bg-muted px-1 rounded">{change.table}</code> added
        </span>
      );
    case 'table_removed':
      return (
        <span>
          Table <code className="font-mono text-xs bg-muted px-1 rounded">{change.table}</code> removed
        </span>
      );
    case 'column_added':
      return (
        <span>
          Column <code className="font-mono text-xs bg-muted px-1 rounded">{change.column}</code>
          <span className="text-muted-foreground ml-1">({change.dataType})</span> added in{' '}
          <code className="font-mono text-xs bg-muted px-1 rounded">{change.table}</code>
        </span>
      );
    case 'column_removed':
      return (
        <span>
          Column <code className="font-mono text-xs bg-muted px-1 rounded">{change.column}</code>
          <span className="text-muted-foreground ml-1">({change.dataType})</span> removed from{' '}
          <code className="font-mono text-xs bg-muted px-1 rounded">{change.table}</code>
        </span>
      );
    case 'column_changed':
      return (
        <span>
          Column <code className="font-mono text-xs bg-muted px-1 rounded">{change.column}</code> in{' '}
          <code className="font-mono text-xs bg-muted px-1 rounded">{change.table}</code> changed type{' '}
          <code className="font-mono text-xs bg-muted px-1">{change.from}</code> →{' '}
          <code className="font-mono text-xs bg-muted px-1">{change.to}</code>
        </span>
      );
    case 'index_added':
      return (
        <span>
          Index <code className="font-mono text-xs bg-muted px-1 rounded">{change.index}</code>
          <span className="text-muted-foreground ml-1">([{change.columns.join(', ')}])</span> added on{' '}
          <code className="font-mono text-xs bg-muted px-1 rounded">{change.table}</code>
        </span>
      );
    case 'index_removed':
      return (
        <span>
          Index <code className="font-mono text-xs bg-muted px-1 rounded">{change.index}</code>
          <span className="text-muted-foreground ml-1">([{change.columns.join(', ')}])</span> removed from{' '}
          <code className="font-mono text-xs bg-muted px-1 rounded">{change.table}</code>
        </span>
      );
  }
}

function ChangeIcon({ type }: { type: SchemaChangeDescriptor['type'] }) {
  const Icon = CHANGE_ICONS[type];
  return <Icon className={`size-3.5 shrink-0 ${CHANGE_COLORS[type]}`} />;
}

function ChangeBadge({ type }: { type: SchemaChangeDescriptor['type'] }) {
  const label = type.replace(/_/g, ' ');
  const variant = type.includes('added') ? 'default' : type.includes('removed') ? 'destructive' : 'secondary';
  return (
    <Badge variant={variant} className="shrink-0 whitespace-nowrap text-[10px] px-1.5 py-0 h-4">
      {label}
    </Badge>
  );
}

function SourceBadge({ source }: { source?: SchemaSnapshotSource }) {
  if (!source || source === 'manual') return null;
  const label = source === 'auto-cadence' ? 'auto' : 'notify';
  const variant = source === 'auto-cadence' ? 'secondary' : 'outline';
  return (
    <Badge variant={variant} className="text-[10px] h-4 px-1.5">
      {label}
    </Badge>
  );
}

export function SchemaTimeline({ connectionId }: { connectionId: number }) {
  const { data, isLoading, error } = useSchemaChangelog(connectionId);
  const { data: connections } = useConnections();
  const { mutateAsync: capture, isPending: capturing } = useCaptureSchemaSnapshot();
  const { data: snapshotsData } = useSchemaSnapshots(connectionId);
  const { data: watcherStatus } = useSchemaWatcherStatus(connectionId);
  const { mutateAsync: startWatcher, isPending: startingWatcher } = useStartSchemaWatcher();
  const { mutateAsync: stopWatcher, isPending: stoppingWatcher } = useStopSchemaWatcher();
  const { mutateAsync: startNotify, isPending: startingNotify } = useStartSchemaNotifyWatcher();
  const { mutateAsync: stopNotify, isPending: stoppingNotify } = useStopSchemaNotifyWatcher();
  const [selectedInterval, setSelectedInterval] = useState(INTERVAL_PRESETS[3].value);
  const queryClient = useQueryClient();
  const connection = connections?.find((item) => item.id === connectionId);
  const canCompare = isSqlKind(connection?.kind);
  const isPostgres = connection?.kind === KIND.POSTGRES;

  const snapshotSources = new Map((snapshotsData?.snapshots ?? []).map((s) => [s.id, s.source]));

  // Detect auto-capture events and invalidate changelog/snapshots + toast.
  useAutoCaptureInvalidation(connectionId);

  const handleToggleCadence = async () => {
    try {
      if (watcherStatus?.cadenceRunning) {
        await stopWatcher(connectionId);
      } else {
        await startWatcher({ connectionId, intervalMs: selectedInterval });
      }
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SCHEMA_WATCHER(connectionId) });
    } catch (err) {
      const message = safeErrorMessage(err, 'Watcher toggle failed');
      toastError(message);
    }
  };

  const handleToggleNotify = async () => {
    try {
      if (watcherStatus?.notifyRunning) {
        await stopNotify(connectionId);
      } else {
        await startNotify(connectionId);
      }
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SCHEMA_WATCHER(connectionId) });
    } catch (err) {
      const message = safeErrorMessage(err, 'Notify watcher toggle failed');
      toastError(message);
    }
  };

  const handleCapture = async () => {
    try {
      const result = await capture(connectionId);
      toastSuccess(`Snapshot captured — ${result.tableCount} tables`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SCHEMA_SNAPSHOTS(connectionId) }),
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SCHEMA_CHANGELOG(connectionId) }),
      ]);
    } catch (err) {
      const message = safeErrorMessage(err, 'Capture failed');
      toastError(message);
      void appendFrontendLog({
        level: 'error',
        scope: 'schema-timeline.capture',
        message: `Schema capture failed: ${message}`,
        details: err instanceof Error ? err.stack : String(err),
      });
    }
  };

  const entries = data?.entries ?? [];

  return (
    <div className="p-4 h-full overflow-y-auto space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <History className="size-4" />
          Schema Change Timeline
        </h2>
        <div className="flex items-center gap-2">
          {canCompare && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => openSchemaDiffTab(connectionId)}
            >
              <GitCompare className="size-3.5" />
              Compare
            </Button>
          )}
          <Button
            variant="default"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={handleCapture}
            disabled={capturing}
          >
            {capturing ? <Spinner size="sm" className="size-3.5" /> : <Camera className="size-3.5" />}
            {capturing ? 'Capturing...' : 'Capture Snapshot'}
          </Button>
        </div>
      </div>

      {/* Auto-Snapshot controls — opt-in cadence watcher */}
      <Card>
        <CardContent className="py-3 space-y-2">
          <div className="flex items-center gap-2">
            <Clock className="size-3.5 text-muted-foreground" />
            <span className="text-xs font-medium">Auto-Snapshot</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={watcherStatus?.cadenceRunning ? 'default' : 'outline'}
              size="sm"
              className="h-6 text-xs"
              onClick={handleToggleCadence}
              disabled={startingWatcher || stoppingWatcher}
            >
              {watcherStatus?.cadenceRunning ? 'Cadence: On' : 'Cadence: Off'}
            </Button>
            <Select
              value={String(selectedInterval)}
              onValueChange={(val) => setSelectedInterval(Number(val))}
              disabled={watcherStatus?.cadenceRunning}
            >
              <SelectTrigger className="h-6 w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INTERVAL_PRESETS.map((preset) => (
                  <SelectItem key={preset.value} value={String(preset.value)} className="text-xs">
                    {preset.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {watcherStatus?.lastCaptureAt && (
              <span className="text-[10px] text-muted-foreground">
                Last: {new Date(watcherStatus.lastCaptureAt).toLocaleTimeString()}
              </span>
            )}
          </div>
          {isPostgres && (
            <div className="flex items-center gap-2">
              <Button
                variant={watcherStatus?.notifyRunning ? 'default' : 'outline'}
                size="sm"
                className="h-6 text-xs"
                onClick={handleToggleNotify}
                disabled={startingNotify || stoppingNotify}
              >
                <Radio className="size-3 mr-1" />
                {watcherStatus?.notifyRunning ? 'pg_notify: On' : 'pg_notify: Off'}
              </Button>
              {watcherStatus?.notifyRunning && (
                <span className="text-[10px] text-muted-foreground">Listening for schema changes</span>
              )}
            </div>
          )}
          {isPostgres && !watcherStatus?.notifyRunning && (
            <details className="text-[10px] text-muted-foreground">
              <summary className="cursor-pointer hover:text-foreground">Setup trigger SQL</summary>
              <pre className="mt-1 p-2 bg-muted rounded text-[10px] overflow-x-auto">{`CREATE OR REPLACE FUNCTION notify_schema_change()
RETURNS event_trigger AS $$
BEGIN
  PERFORM pg_notify('kamehadb_schema_change', '');
END;
$$ LANGUAGE plpgsql;

CREATE EVENT TRIGGER kamehadb_schema_watch
ON ddl_command_end
EXECUTE FUNCTION notify_schema_change();`}</pre>
            </details>
          )}
        </CardContent>
      </Card>

      {error && (
        <div className="text-sm text-destructive">
          {error instanceof Error ? error.message : 'Failed to load changelog'}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : entries.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            <Camera className="size-8 mx-auto mb-2 opacity-40" />
            <p>No snapshots yet</p>
            <p className="text-xs mt-1">Click "Capture Snapshot" to save the current schema</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {[...entries].reverse().map((entry: import('@kamehadb/shared').SchemaChangelogEntry, idx: number) => {
            const isLatest = idx === 0;
            const isFirst = idx === entries.length - 1;
            return (
              <Card key={entry.snapshotId} className={isLatest ? 'ring-1 ring-primary/20' : ''}>
                <CardHeader>
                  <CardTitle className="text-xs text-muted-foreground flex items-center gap-2">
                    <History className="size-3" />
                    {new Date(entry.capturedAt).toLocaleString()}
                    {isLatest && (
                      <Badge variant="default" className="text-[10px] h-4 px-1.5">
                        latest
                      </Badge>
                    )}
                    {isFirst && entry.changes.length === 0 && (
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                        initial
                      </Badge>
                    )}
                    <SourceBadge source={snapshotSources.get(entry.snapshotId)} />
                    <span className="text-muted-foreground/60">
                      {entry.changes.length} change{entry.changes.length !== 1 ? 's' : ''}
                    </span>
                  </CardTitle>
                </CardHeader>
                {entry.changes.length > 0 && (
                  <CardContent className="pt-0">
                    <div className="space-y-1">
                      {entry.changes.map((change: import('@kamehadb/shared').SchemaChangeDescriptor, ci: number) => (
                        <div key={ci} className="flex items-start gap-2 text-sm py-0.5">
                          <ChangeIcon type={change.type} />
                          <span className="min-w-0 flex-1">
                            <DescribeChange change={change} />
                          </span>
                          <ChangeBadge type={change.type} />
                        </div>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
