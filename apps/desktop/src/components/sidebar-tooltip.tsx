import { TooltipContent } from '@/components/ui/tooltip';
import type { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip';
import type { ConnectionProfile } from '@kamehadb/shared';
import { DbIcon } from './db-icon';
import { getIndicatorColor, getStatusLabel } from './sidebar.helpers';
import type { ConnectionStatus } from './sidebar.helpers';

// ConnectionTooltip renders a rich connection details card positioned to the right
// outside the sidebar with elevated z-index and pointer-events-none so it never intercepts clicks. (How / Why / What)
export function ConnectionTooltip({
  conn,
  status,
  latency,
  anchor,
}: {
  conn: ConnectionProfile;
  status: ConnectionStatus;
  latency?: number;
  anchor?: TooltipPrimitive.Positioner.Props['anchor'];
}) {
  const color = getIndicatorColor(conn, status);
  const label = getStatusLabel(status, latency);

  return (
    <TooltipContent
      anchor={anchor}
      side="right"
      align="center"
      sideOffset={14}
      collisionBoundary={typeof document !== 'undefined' ? document.body : undefined}
      collisionAvoidance={{ side: 'none', align: 'shift' }}
      className="min-w-56 max-w-72 rounded-xl border border-border/80 bg-popover/95 p-3 shadow-xl backdrop-blur-md select-none pointer-events-none"
    >
      <div className="w-full text-xs">
        {/* Header with engine icon, connection name, engine type, and status pill */}
        <div className="flex items-center gap-2 mb-2 pb-2 border-b border-border/50">
          <DbIcon kind={conn.kind} className="size-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-foreground text-xs truncate leading-tight">{conn.name}</p>
            <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">{conn.kind}</p>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-muted/60 text-[11px] font-medium shrink-0">
            <span className="size-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
            <span>{label}</span>
          </div>
        </div>

        {/* Detailed key-value connection parameters */}
        <div className="space-y-1.5 text-[11px]">
          {conn.host && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Host</span>
              <span className="font-mono text-foreground/90 truncate">
                {conn.host}
                {conn.port ? `:${conn.port}` : ''}
              </span>
            </div>
          )}
          {conn.database && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Database</span>
              <span className="font-mono text-foreground/90 truncate">{conn.database}</span>
            </div>
          )}
          {conn.username && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">User</span>
              <span className="font-mono text-foreground/90 truncate">{conn.username}</span>
            </div>
          )}
          {conn.filePath && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">File</span>
              <span className="font-mono text-foreground/90 truncate">{conn.filePath}</span>
            </div>
          )}
          {conn.updatedAt && (
            <div className="flex items-center justify-between gap-3 pt-1 border-t border-border/40 text-[10px] text-muted-foreground/70">
              <span>Updated</span>
              <span>
                {new Date(conn.updatedAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          )}
        </div>
      </div>
    </TooltipContent>
  );
}
