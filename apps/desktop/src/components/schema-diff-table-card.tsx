import type { SchemaColumnDiff, SchemaIndexDiff, SchemaTableDiff, SchemaValueChange } from '@kamehadb/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function formatValue(value: SchemaValueChange<string>['from']): string {
  if (Array.isArray(value)) return value.join(', ');
  if (value === null) return 'null';
  return String(value);
}

function DiffFieldPills({ changes }: { readonly changes: readonly SchemaValueChange<string>[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {changes.map((change) => (
        <Badge key={change.field} variant="secondary" className="text-xs gap-1">
          <span className="font-medium">{change.field}</span>
          <span className="text-muted-foreground">{formatValue(change.from)}</span>
          <span>→</span>
          <span>{formatValue(change.to)}</span>
        </Badge>
      ))}
    </div>
  );
}

function ColumnRow({ diff }: { readonly diff: SchemaColumnDiff }) {
  if (diff.type === 'added' || diff.type === 'removed') {
    return (
      <div className="px-3 py-2 text-sm rounded-md border-border/70 border">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-mono">{diff.column.name}</div>
          <Badge variant={diff.type === 'added' ? 'default' : 'destructive'}>{diff.type}</Badge>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">{diff.column.type}</div>
      </div>
    );
  }

  return (
    <div className="px-3 py-2 text-sm rounded-md border-border/70 border">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-mono">{diff.columnName}</div>
        <Badge variant="secondary">changed</Badge>
      </div>
      <div className="mt-2">
        <DiffFieldPills changes={diff.changes} />
      </div>
    </div>
  );
}

function IndexRow({ diff }: { readonly diff: SchemaIndexDiff }) {
  if (diff.type === 'added' || diff.type === 'removed') {
    return (
      <div className="px-3 py-2 text-sm rounded-md border-border/70 border">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-mono">{diff.index.name}</div>
          <Badge variant={diff.type === 'added' ? 'default' : 'destructive'}>{diff.type}</Badge>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">{diff.index.columns.join(', ')}</div>
      </div>
    );
  }

  return (
    <div className="px-3 py-2 text-sm rounded-md border-border/70 border">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-mono">{diff.indexName}</div>
        <Badge variant="secondary">changed</Badge>
      </div>
      <div className="mt-2">
        <DiffFieldPills changes={diff.changes} />
      </div>
    </div>
  );
}

export function SchemaDiffTableCard({ tableDiff }: { readonly tableDiff: SchemaTableDiff }) {
  if (tableDiff.type === 'added' || tableDiff.type === 'removed') {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-sm gap-3">
            <span className="font-mono">{tableDiff.tableId}</span>
            <Badge variant={tableDiff.type === 'added' ? 'default' : 'destructive'}>{tableDiff.type}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground">
          {tableDiff.table.columns.length} columns, {tableDiff.table.indexes.length} indexes
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-sm gap-3">
          <span className="font-mono">{tableDiff.tableId}</span>
          <Badge variant="secondary">{tableDiff.changeCount} changes</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {tableDiff.columnDiffs.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground font-medium">Columns</div>
              <Badge variant="outline" className="text-xs">
                {tableDiff.columnDiffs.length}
              </Badge>
            </div>
            <div className="space-y-2">
              {tableDiff.columnDiffs.map((diff) => (
                <ColumnRow key={diff.type === 'changed' ? diff.columnName : diff.column.name} diff={diff} />
              ))}
            </div>
          </div>
        )}
        {tableDiff.columnDiffs.length > 0 && tableDiff.indexDiffs.length > 0 && (
          <div className="border-t border-border/70" />
        )}
        {tableDiff.indexDiffs.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground font-medium">Indexes</div>
              <Badge variant="outline" className="text-xs">
                {tableDiff.indexDiffs.length}
              </Badge>
            </div>
            <div className="space-y-2">
              {tableDiff.indexDiffs.map((diff) => (
                <IndexRow key={diff.type === 'changed' ? diff.indexName : diff.index.name} diff={diff} />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
