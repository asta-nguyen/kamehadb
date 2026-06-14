import { Badge } from '@/components/ui/badge';

type PostgresToolLogEntry = {
  readonly stream: 'stdout' | 'stderr';
  readonly line: string;
};

type PostgresToolLogProps = {
  readonly status: string;
  readonly message: string | null;
  readonly logs: readonly PostgresToolLogEntry[];
};

export function PostgresToolLog({ status, message, logs }: PostgresToolLogProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="capitalize">
          {status}
        </Badge>
        {message ? <span className="text-xs text-muted-foreground">{message}</span> : null}
      </div>
      <div className="rounded-md border bg-muted/20">
        <div className="max-h-56 overflow-auto p-2">
          {logs.length === 0 ? (
            <p className="text-xs text-muted-foreground">Command output will appear here.</p>
          ) : (
            <div className="space-y-1 font-mono text-xs">
              {logs.map((log, index) => (
                <div key={`${index}-${log.stream}-${log.line.slice(0, 24)}`} className="break-all">
                  <span className={log.stream === 'stderr' ? 'text-amber-500' : 'text-muted-foreground'}>
                    [{log.stream}]
                  </span>{' '}
                  <span>{log.line}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
