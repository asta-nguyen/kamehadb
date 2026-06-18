import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Play } from 'lucide-react';
import type { PostgresVectorMode } from '@/components/postgres-vector-query-state';

type VectorColumnOption = {
  readonly columnName: string;
  readonly dimensions: number;
};

type PostgresVectorQueryControlsProps = {
  readonly mode: PostgresVectorMode;
  readonly schema: string;
  readonly table: string;
  readonly column: string;
  readonly metric: 'l2' | 'cosine' | 'inner_product';
  readonly limit: number;
  readonly vectorText: string;
  readonly filterText: string;
  readonly running: boolean;
  readonly error: string | null;
  readonly info: string | null;
  readonly schemas: readonly string[];
  readonly vectorTables: readonly string[];
  readonly vectorColumns: readonly VectorColumnOption[];
  readonly onModeChange: (value: PostgresVectorMode) => void;
  readonly onSchemaChange: (value: string) => void;
  readonly onTableChange: (value: string) => void;
  readonly onColumnChange: (value: string) => void;
  readonly onMetricChange: (value: 'l2' | 'cosine' | 'inner_product') => void;
  readonly onLimitChange: (value: number) => void;
  readonly onVectorTextChange: (value: string) => void;
  readonly onFilterTextChange: (value: string) => void;
  readonly onRun: () => void;
};

export function PostgresVectorQueryControls({
  mode,
  schema,
  table,
  column,
  metric,
  limit,
  vectorText,
  filterText,
  running,
  error,
  info,
  schemas,
  vectorTables,
  vectorColumns,
  onModeChange,
  onSchemaChange,
  onTableChange,
  onColumnChange,
  onMetricChange,
  onLimitChange,
  onVectorTextChange,
  onFilterTextChange,
  onRun,
}: PostgresVectorQueryControlsProps) {
  return (
    <div className="p-3 border-b border-border space-y-2">
      <div className="flex items-center gap-1 bg-muted/40 rounded-md p-0.5 w-fit">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onModeChange('similar')}
          className={
            mode === 'similar'
              ? 'bg-background shadow-sm text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }
        >
          Vector
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onModeChange('raw')}
          className={
            mode === 'raw' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
          }
        >
          Raw SQL
        </Button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Select value={schema || ''} onValueChange={(value) => onSchemaChange(value ?? '')}>
          <SelectTrigger size="sm" className="h-7 text-xs w-28">
            <SelectValue placeholder="Schema…" />
          </SelectTrigger>
          <SelectContent>
            {schemas.map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={table || ''} onValueChange={(value) => onTableChange(value ?? '')}>
          <SelectTrigger size="sm" className="h-7 text-xs w-40">
            <SelectValue placeholder="Table…" />
          </SelectTrigger>
          <SelectContent>
            {vectorTables.map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={column || ''} onValueChange={(value) => onColumnChange(value ?? '')}>
          <SelectTrigger size="sm" className="h-7 text-xs w-40">
            <SelectValue placeholder="Vector column…" />
          </SelectTrigger>
          <SelectContent>
            {vectorColumns.map((value) => (
              <SelectItem key={value.columnName} value={value.columnName}>
                {value.columnName} ({value.dimensions}d)
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={metric} onValueChange={(value) => onMetricChange(value as 'l2' | 'cosine' | 'inner_product')}>
          <SelectTrigger size="sm" className="h-7 text-xs w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="cosine">Cosine</SelectItem>
            <SelectItem value="l2">L2 Distance</SelectItem>
            <SelectItem value="inner_product">Inner Product</SelectItem>
          </SelectContent>
        </Select>

        <Label className="text-xs text-muted-foreground flex items-center gap-1">
          Limit
          <Input
            type="number"
            min={1}
            max={500}
            value={limit}
            onChange={(event) => onLimitChange(Math.max(1, Math.min(500, Number(event.target.value) || 1)))}
            className="h-7 w-16 px-2 text-xs bg-background border rounded"
          />
        </Label>

        <Button size="sm" onClick={onRun} disabled={running} className="ml-auto">
          {running ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <Play className="size-3.5 mr-1.5" />}
          Search
        </Button>
      </div>

      <Textarea
        value={vectorText}
        onChange={(event) => onVectorTextChange(event.target.value)}
        placeholder="[0.1, 0.2, 0.3, ...]"
        spellCheck={false}
        className="w-full min-h-20 px-2 py-1 text-xs font-mono bg-background border rounded resize-y"
      />

      <Input
        value={filterText}
        onChange={(event) => onFilterTextChange(event.target.value)}
        placeholder={"Optional filter, e.g. category = 'docs' AND id > 10"}
        className="w-full h-9 px-2 text-sm bg-background border rounded"
      />

      {error && <div className="text-xs text-destructive">{error}</div>}
      {info && !error && <div className="text-xs text-muted-foreground">{info}</div>}
    </div>
  );
}
