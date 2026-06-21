import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Copy, RefreshCw, ScrollText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { appendFrontendLog, formatLogTimestamp, readAppLogs, type AppLogEntry } from '@/lib/app-logs';
import { navigateTo } from '@/store';

type SourceFilter = 'all' | 'frontend' | 'tauri' | 'sidecar';
type LevelFilter = 'all' | 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

const SOURCE_OPTIONS: readonly SourceFilter[] = ['all', 'frontend', 'tauri', 'sidecar'];
const LEVEL_OPTIONS: readonly LevelFilter[] = ['all', 'fatal', 'error', 'warn', 'info', 'debug', 'trace'];

function matchesSearch(entry: AppLogEntry, query: string): boolean {
  if (!query) return true;
  const haystack = [entry.message, entry.scope, entry.details, entry.stack, entry.url].filter(Boolean).join('\n');
  return haystack.toLowerCase().includes(query);
}

function formatLogLine(entry: AppLogEntry): string {
  const parts = [
    `[${formatLogTimestamp(entry.timestampMs)}]`,
    `[${entry.source}]`,
    `[${entry.level}]`,
    entry.scope ? `[${entry.scope}]` : null,
    entry.message,
  ].filter(Boolean);

  return [parts.join(' '), entry.details, entry.stack].filter(Boolean).join('\n');
}

function levelVariant(level: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (level === 'fatal' || level === 'error') return 'destructive';
  if (level === 'warn') return 'secondary';
  if (level === 'info') return 'default';
  return 'outline';
}

export function LogsPage() {
  const [entries, setEntries] = useState<AppLogEntry[]>([]);
  const [logDir, setLogDir] = useState('');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [levelFilter, setLevelFilter] = useState<LevelFilter>('all');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);

  const loadLogs = useCallback(async (silent = false) => {
    if (!silent) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }

    try {
      const snapshot = await readAppLogs();
      setEntries(snapshot.entries);
      setLogDir(snapshot.logDir);
      setError(null);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Failed to load logs';
      setError(message);
      void appendFrontendLog({
        level: 'error',
        scope: 'logs-page',
        message: 'Failed to load app logs',
        details: message,
        stack: loadError instanceof Error ? loadError.stack : undefined,
        url: typeof window !== 'undefined' ? window.location.href : undefined,
      });
    } finally {
      if (silent) {
        setIsRefreshing(false);
      } else {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadLogs();
    const intervalId = window.setInterval(() => {
      void loadLogs(true);
    }, 2000);
    return () => window.clearInterval(intervalId);
  }, [loadLogs]);

  const filteredEntries = useMemo(() => {
    const query = search.trim().toLowerCase();
    return entries.filter((entry) => {
      if (sourceFilter !== 'all' && entry.source !== sourceFilter) return false;
      if (levelFilter !== 'all' && entry.level !== levelFilter) return false;
      return matchesSearch(entry, query);
    });
  }, [entries, levelFilter, search, sourceFilter]);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(filteredEntries.map(formatLogLine).join('\n\n'));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }, [filteredEntries]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <div className="border-b border-border">
        <div className="flex flex-wrap items-start gap-3 px-5 py-4">
          <Button variant="ghost" size="icon-sm" onClick={() => navigateTo('workspace')} title="Back to workspace">
            <ArrowLeft className="size-4" />
          </Button>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
                <ScrollText className="size-4" />
                Logs
              </h1>
              <Badge variant="outline" className="text-xs">
                Auto refresh every 2s
              </Badge>
            </div>
            <p className="max-w-3xl text-sm text-muted-foreground">
              View frontend, Tauri, and sidecar errors without reopening the app from Terminal.
            </p>
            <p className="text-xs text-muted-foreground">Log directory: {logDir || 'Loading...'}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void loadLogs(true)} disabled={isRefreshing}>
              {isRefreshing ? (
                <Spinner size="sm" className="mr-1.5 size-3.5" />
              ) : (
                <RefreshCw className="mr-1.5 size-3.5" />
              )}
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleCopy()}
              disabled={filteredEntries.length === 0}
            >
              <Copy className="mr-1.5 size-3.5" />
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 border-b border-border px-5 py-3">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search messages, scopes, stack traces..."
          className="max-w-md"
        />
        <Select value={sourceFilter} onValueChange={(value) => setSourceFilter(value as SourceFilter)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            {SOURCE_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={levelFilter} onValueChange={(value) => setLevelFilter(value as LevelFilter)}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Level" />
          </SelectTrigger>
          <SelectContent>
            {LEVEL_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center text-xs text-muted-foreground">{filteredEntries.length} entries</div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Spinner size="lg" />
          </div>
        ) : error ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-destructive">Failed to load logs</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">{error}</CardContent>
          </Card>
        ) : filteredEntries.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No log entries match the current filters.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredEntries.map((entry, index) => (
              <Card key={`${entry.source}-${entry.timestampMs}-${index}`}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="font-mono text-[11px]">
                      {formatLogTimestamp(entry.timestampMs)}
                    </Badge>
                    <Badge variant="outline" className="uppercase text-[11px]">
                      {entry.source}
                    </Badge>
                    <Badge variant={levelVariant(entry.level)} className="uppercase text-[11px]">
                      {entry.level}
                    </Badge>
                    {entry.scope ? (
                      <Badge variant="secondary" className="font-mono text-[11px]">
                        {entry.scope}
                      </Badge>
                    ) : null}
                  </div>

                  <div className="text-sm font-medium leading-relaxed">{entry.message}</div>

                  {entry.details ? (
                    <pre className="overflow-x-auto rounded-md border border-border bg-muted/30 p-3 text-xs whitespace-pre-wrap">
                      {entry.details}
                    </pre>
                  ) : null}

                  {entry.stack ? (
                    <pre className="overflow-x-auto rounded-md border border-border bg-muted/20 p-3 text-xs whitespace-pre-wrap text-muted-foreground">
                      {entry.stack}
                    </pre>
                  ) : null}

                  {entry.url ? <div className="text-xs text-muted-foreground">{entry.url}</div> : null}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
