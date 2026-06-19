import { TooltipContent } from '@/components/ui/tooltip';
import { formatShortDateTime } from '@/lib/utils';
import type { ConnectionProfile } from '@kamehadb/shared';
import { getIndicatorColor, getStatusLabel } from './sidebar.helpers';
import type { ConnectionStatus } from './sidebar.helpers';

export function ConnectionTooltip({
  conn,
  status,
  latency,
}: {
  conn: ConnectionProfile;
  status: ConnectionStatus;
  latency?: number;
}) {
  const color = getIndicatorColor(conn, status);
  const label = getStatusLabel(status, latency);
  return (
    <TooltipContent side="right" align="start" sideOffset={12} className="px-4 py-3 rounded-lg shadow-xs">
      <div className="min-w-45 text-xs leading-relaxed">
        <p className="mb-2 font-semibold">{conn.name}</p>
        <div className="text-popover-foreground/65 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
            <span>{label}</span>
          </div>
          <p className="capitalize">
            {conn.kind}
            {conn.host ? ` · ${conn.host}${conn.port ? `:${conn.port}` : ''}` : ''}
          </p>
          {conn.database && <p>db: {conn.database}</p>}
          {conn.updatedAt && (
            <p className="text-popover-foreground/40 text-xs">{formatShortDateTime(conn.updatedAt)}</p>
          )}
        </div>
      </div>
    </TooltipContent>
  );
}
