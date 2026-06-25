import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronRight, Copy, RefreshCw, ScrollText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { appendFrontendLog, formatLogTimestamp, readAppLogs, type AppLogEntry } from '@/lib/app-logs';
import { navigateTo } from '@/store';
import { cn } from 'cnfast';

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

const LEVEL_STYLES: Record<string, { border: string; text: string; bg: string }> = {
  fatal: { border: 'border-l-red-500', text: 'text-red-500', bg: 'bg-red-500/5' },
  error: { border: 'border-l-red-500', text: 'text-red-500', bg: 'bg-red-500/5' },
  warn: { border: 'border-l-yellow-500', text: 'text-yellow-600', bg: 'bg-yellow-500/5' },
  info: { border: 'border-l-blue-500', text: 'text-blue-500', bg: '' },
  debug: { border: 'border-l-muted-foreground/30', text: 'text-muted-foreground', bg: '' },
  trace: { border: 'border-l-muted-foreground/20', text: 'text-muted-foreground/60', bg: '' },
};

function levelStyle(level: string) {
  return LEVEL_STYLES[level] ?? LEVEL_STYLES.debug;
}

function LogEntry({ entry, index }: { entry: AppLogEntry; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = !!entry.details || !!entry.stack;
  const style = levelStyle(entry.level);

  return (
    <div
      key={`${entry.source}-${entry.timestampMs}-${index}`}
      className={cn(
        'group border-l-2 px-3 py-1.5 font-mono text-xs leading-relaxed transition-colors hover:bg-muted/30',
        style.border,
        style.bg,
      )}
    >
      <div className="flex items-start gap-2">
        <span className="shrink-0 text-[10px] text-muted-foreground/50 tabular-nums pt-0.5">
          {formatLogTimestamp(entry.timestampMs)}
        </span>
        <span className="shrink-0 text-[10px] uppercase text-muted-foreground/60 pt-0.5 w-16">{entry.source}</span>
        <span className={cn('shrink-0 text-[10px] uppercase font-bold pt-0.5 w-12', style.text)}>{entry.level}</span>
        <div className="min-w-0 flex-1">
          <div
            className={cn('break-words', hasDetails && 'cursor-pointer select-text')}
            onClick={hasDetails ? () => setExpanded((v) => !v) : undefined}
          >
            {hasDetails && (
              <ChevronRight
                className={cn(
                  'inline-block size-3 mr-1 transition-transform text-muted-foreground/40',
                  expanded && 'rotate-90',
                )}
              />
            )}
            <span className="text-foreground/90">{entry.message}</span>
            {entry.scope && <span className="ml-1.5 text-[10px] text-muted-foreground/40">[{entry.scope}]</span>}
          </div>
          {expanded && (
            <div className="mt-1 space-y-1">
              {entry.details && (
                <pre className="overflow-x-auto rounded bg-muted/40 p-2 text-[11px] whitespace-pre-wrap break-words text-muted-foreground">
                  {entry.details}
                </pre>
              )}
              {entry.stack && (
                <pre className="overflow-x-auto rounded bg-muted/20 p-2 text-[11px] whitespace-pre-wrap break-words text-muted-foreground/70">
                  {entry.stack}
                </pre>
              )}
              {entry.url && <div className="text-[10px] text-muted-foreground/40 truncate">{entry.url}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
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
  }, [filteredEntries]);

  return (
    <div className="flex w-full h-full flex-col overflow-hidden bg-background">
      <div className="shrink-0 border-b border-border">
        <div className="flex items-center gap-3 px-4 py-2.5">
          <Button variant="ghost" size="icon-sm" onClick={() => navigateTo('workspace')} title="Back to workspace">
            <ArrowLeft className="size-4" />
          </Button>
          <div className="flex items-center gap-2">
            <ScrollText className="size-4 text-muted-foreground" />
            <h1 className="text-sm font-semibold tracking-tight">Logs</h1>
            <span className="text-[10px] text-muted-foreground/50">auto 2s</span>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => void loadLogs(true)}
              disabled={isRefreshing}
              className="size-7"
              title="Refresh"
            >
              {isRefreshing ? <Spinner size="sm" className="size-3" /> : <RefreshCw className="size-3" />}
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => void handleCopy()}
              disabled={filteredEntries.length === 0}
              className="size-7"
              title="Copy logs"
            >
              <Copy className="size-3" />
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-1.5 px-4 pb-2.5">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search logs..."
            className="h-7 text-xs"
          />
          <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5 shrink-0">
            {SOURCE_OPTIONS.map((opt) => (
              <Button
                key={opt}
                variant="ghost"
                onClick={() => setSourceFilter(opt)}
                className={cn(
                  'rounded px-2 py-0.5 text-[10px] font-medium uppercase transition-colors',
                  sourceFilter === opt
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                )}
              >
                {opt}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5 shrink-0">
            {LEVEL_OPTIONS.map((opt) => (
              <Button
                key={opt}
                variant="ghost"
                onClick={() => setLevelFilter(opt)}
                className={cn(
                  'rounded px-1.5 py-0.5 text-[10px] font-medium uppercase transition-colors',
                  levelFilter === opt
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                )}
              >
                {opt}
              </Button>
            ))}
          </div>
          <span className="text-[10px] text-muted-foreground ml-auto tabular-nums w-20 text-right shrink-0">
            {filteredEntries.length} entries
          </span>
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-y-scroll overflow-x-hidden [scrollbar-width:thin] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/40 [&::-webkit-scrollbar-thumb:hover]:bg-muted-foreground/60 [&::-webkit-scrollbar-track]:bg-muted/30">
        {isLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <Spinner size="lg" />
          </div>
        ) : error ? (
          <div className="flex flex-1 items-center justify-center p-4 text-sm text-destructive font-mono">
            Failed to load logs: {error}
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            No log entries match the current filters.
          </div>
        ) : (
          <div className="flex-1 py-1">
            {filteredEntries.map((entry, index) => (
              <LogEntry key={`${entry.source}-${entry.timestampMs}-${index}`} entry={entry} index={index} />
            ))}
          </div>
        )}
      </div>

      {logDir && (
        <div
          className="shrink-0 border-t border-border px-4 py-1 text-[10px] text-muted-foreground/40 truncate"
          title={logDir}
        >
          {logDir}
        </div>
      )}
    </div>
  );
}
