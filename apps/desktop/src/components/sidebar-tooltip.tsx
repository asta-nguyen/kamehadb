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
    <TooltipContent side="right" align="start" sideOffset={12} className="rounded-lg shadow-sm px-4 py-3">
      <div className="text-xs leading-relaxed min-w-45">
        <p className="font-semibold mb-2">{conn.name}</p>
        <div className="space-y-1.5 text-popover-foreground/65">
          <div className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
            <span>{label}</span>
          </div>
          <p className="capitalize">
            {conn.kind}
            {conn.host ? ` · ${conn.host}:${conn.port}` : ''}
          </p>
          {conn.database && <p>db: {conn.database}</p>}
          {conn.updatedAt && (
            <p className="text-popover-foreground/40 text-[10px]">{formatShortDateTime(conn.updatedAt)}</p>
          )}
        </div>
      </div>
    </TooltipContent>
  );
}
