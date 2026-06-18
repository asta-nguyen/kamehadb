import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { SchemaChangelogEntry } from '@kamehadb/shared';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Copy, Check, ArrowRight, Terminal } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { toast } from 'sonner';

export function MigrationAssistant({ connectionId }: { connectionId: string }) {
  const [snapshots, setSnapshots] = useState<SchemaChangelogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .getSchemaChangelog(connectionId)
      .then((data) => {
        if (!cancelled) {
          setSnapshots(data.entries ?? []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [connectionId]);

  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ statements: string[]; fromSnapshot: string; toSnapshot: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    if (!fromId || !toId) return;
    setGenerating(true);
    setResult(null);
    try {
      const r = await api.generateMigration(connectionId, { fromSnapshotId: fromId, toSnapshotId: toId });
      setResult(r);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate migration');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.statements.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="p-4 h-full overflow-y-auto space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Terminal className="size-4" />
          Migration Assistant
        </h2>
      </div>

      {loading ? (
        <Card>
          <CardContent className="py-8 flex justify-center">
            <Spinner size="lg" />
          </CardContent>
        </Card>
      ) : snapshots.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No snapshots yet. Go to <span className="font-medium text-foreground">Schema Timeline</span> from the
            connection menu to capture one first.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <ArrowRight className="size-3.5" />
              Select snapshots
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 items-end">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">From (before)</Label>
                <Select value={fromId} onValueChange={(v) => v !== null && setFromId(v)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select snapshot" />
                  </SelectTrigger>
                  <SelectContent>
                    {snapshots.map((s) => (
                      <SelectItem key={s.snapshotId} value={s.snapshotId} className="text-xs font-mono">
                        {new Date(s.capturedAt).toLocaleString()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">To (after)</Label>
                <Select value={toId} onValueChange={(v) => v !== null && setToId(v)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select snapshot" />
                  </SelectTrigger>
                  <SelectContent>
                    {snapshots.map((s) => (
                      <SelectItem key={s.snapshotId} value={s.snapshotId} className="text-xs font-mono">
                        {new Date(s.capturedAt).toLocaleString()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button
              variant="default"
              size="sm"
              className="mt-3 h-8 text-xs gap-1"
              onClick={handleGenerate}
              disabled={!fromId || !toId || fromId === toId || generating}
            >
              {generating ? <Spinner size="sm" className="size-3.5" /> : <Terminal className="size-3.5" />}
              {generating ? 'Generating...' : 'Generate Migration SQL'}
            </Button>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground flex items-center justify-between">
              <span>
                Migration: {new Date(result.fromSnapshot).toLocaleString()} →{' '}
                {new Date(result.toSnapshot).toLocaleString()} ({result.statements.length} statements)
              </span>
              <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={handleCopy}>
                {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <pre className="text-xs font-mono bg-muted p-3 rounded-lg overflow-x-auto whitespace-pre-wrap max-h-[60vh] overflow-y-auto">
              {result.statements.join('\n')}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
