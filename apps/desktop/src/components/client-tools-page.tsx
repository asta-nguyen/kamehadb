import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, RefreshCw, XCircle } from 'lucide-react';
import { useState } from 'react';

import { api } from '@/lib/api';
import { navigateTo } from '@/store';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

type ToolStatus = {
  configured: string | null;
  detected: string | null;
  version: string | null;
  installCommand: string | null;
  uninstallCommand: string | null;
};

type ToolGroup = {
  readonly label: string;
  readonly description: string;
  readonly tools: readonly string[];
};

const TOOL_GROUPS: readonly ToolGroup[] = [
  {
    label: 'PostgreSQL',
    description: 'psql shell, pg_dump backup, pg_restore restore',
    tools: ['psql', 'pg_dump', 'pg_restore'],
  },
  {
    label: 'MySQL / MariaDB',
    description: 'mysql/mariadb shell, mysqldump/mariadb-dump backup & restore',
    tools: ['mysql', 'mysqldump'],
  },
  {
    label: 'MongoDB',
    description: 'mongosh embedded shell',
    tools: ['mongosh'],
  },
];

export function ClientToolsPage() {
  const queryClient = useQueryClient();
  const [busyTool, setBusyTool] = useState<string | null>(null);

  const { data, isLoading } = useQuery<Record<string, ToolStatus>>({
    queryKey: ['client-tool-paths'],
    queryFn: () => api.getClientToolPaths(),
  });

  const handleRecheck = async (tool: string) => {
    setBusyTool(tool);
    try {
      await api.resolveClientTool(tool);
      await queryClient.refetchQueries({ queryKey: ['client-tool-paths'] });
    } finally {
      setBusyTool(null);
    }
  };

  const handleRecheckAll = async () => {
    await queryClient.refetchQueries({ queryKey: ['client-tool-paths'] });
  };

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      {/* Header */}
      <div className="border-b border-border">
        <div className="flex items-center gap-3 px-5 py-3">
          <Button variant="ghost" size="icon-sm" onClick={() => navigateTo('workspace')} title="Back to workspace">
            <ArrowLeft className="size-4" />
          </Button>
          <div className="space-y-0.5">
            <h1 className="text-base font-semibold tracking-tight">Client Tools</h1>
            <p className="text-xs text-muted-foreground">Detected database client binaries on your system.</p>
          </div>
          <div className="ml-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleRecheckAll()}
              disabled={isLoading}
              className="gap-1.5 text-xs"
            >
              <RefreshCw className="size-3.5" />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-5 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size="md" />
          </div>
        ) : (
          <div className="space-y-5">
            {TOOL_GROUPS.map((group) => (
              <div key={group.label} className="space-y-2">
                <div>
                  <h2 className="text-sm font-semibold">{group.label}</h2>
                  <p className="text-xs text-muted-foreground">{group.description}</p>
                </div>
                <div className="divide-y divide-border rounded-lg border border-border">
                  {group.tools.map((tool) => {
                    const status = data?.[tool];
                    return (
                      <ToolRow
                        key={tool}
                        tool={tool}
                        status={status}
                        isBusy={busyTool === tool}
                        onRecheck={() => void handleRecheck(tool)}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ToolRow({
  tool,
  status,
  isBusy,
  onRecheck,
}: {
  readonly tool: string;
  readonly status: ToolStatus | undefined;
  readonly isBusy: boolean;
  readonly onRecheck: () => void;
}) {
  const found = (status?.detected ?? null) !== null;
  const version = status?.version ?? null;
  const detected = status?.detected ?? null;
  const installCommand = status?.installCommand ?? null;
  const uninstallCommand = status?.uninstallCommand ?? null;

  return (
    <div className="flex items-center gap-3 px-3 py-2">
      {/* Status icon */}
      <div className="shrink-0">
        {isBusy ? (
          <Spinner size="sm" />
        ) : found ? (
          <CheckCircle2 className="size-4 text-green-500" />
        ) : (
          <XCircle className="size-4 text-destructive" />
        )}
      </div>

      {/* Tool name + path/version + command hints */}
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="font-mono text-xs font-medium">{tool}</div>
        {found ? (
          <>
            <div className="truncate font-mono text-xs text-muted-foreground" title={detected ?? undefined}>
              {detected}
              {version ? <span className="ml-2 text-muted-foreground/70">{version}</span> : null}
            </div>
            {uninstallCommand ? (
              <div className="font-mono text-xs text-muted-foreground">
                Uninstall: <span className="text-foreground/70">{uninstallCommand}</span>
              </div>
            ) : null}
          </>
        ) : installCommand ? (
          <div className="font-mono text-xs text-muted-foreground">
            Install: <span className="text-foreground/70">{installCommand}</span>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">Not detected</div>
        )}
      </div>

      {/* Recheck button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onRecheck}
        disabled={isBusy}
        className="shrink-0 h-7 w-7 p-0"
        title="Re-check detection"
      >
        <RefreshCw className="size-3" />
      </Button>
    </div>
  );
}
