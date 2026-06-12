import { useSchemaChangelog, useCaptureSchemaSnapshot } from '@/hooks/use-schema-changelog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Camera, History, Plus, Minus, Pencil } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import type { SchemaChangeDescriptor } from '@kamehadb/shared';
import { useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/lib/query-keys';
import { toast } from 'sonner';

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
    <Badge variant={variant} className="text-[10px] px-1.5 py-0 h-4">
      {label}
    </Badge>
  );
}

export function SchemaTimeline({ connectionId }: { connectionId: string }) {
  const { data, isLoading, error } = useSchemaChangelog(connectionId);
  const { mutateAsync: capture, isPending: capturing } = useCaptureSchemaSnapshot();
  const queryClient = useQueryClient();

  const handleCapture = async () => {
    try {
      const result = await capture(connectionId);
      toast.success(`Snapshot captured — ${result.tableCount} tables`);
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SCHEMA_CHANGELOG(connectionId) });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Capture failed');
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
        <Button variant="default" size="sm" className="h-7 text-xs gap-1" onClick={handleCapture} disabled={capturing}>
          {capturing ? <Spinner size="sm" className="size-3.5" /> : <Camera className="size-3.5" />}
          {capturing ? 'Capturing...' : 'Capture Snapshot'}
        </Button>
      </div>

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
