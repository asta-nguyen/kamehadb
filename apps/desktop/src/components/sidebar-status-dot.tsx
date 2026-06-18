import type { ConnectionProfile } from '@kamehadb/shared';
import { getIndicatorColor, getStatusLabel } from './sidebar.helpers';
import type { ConnectionStatus } from './sidebar.helpers';

export function ConnectionStatusDot({
  conn,
  status,
  latency,
}: {
  conn: ConnectionProfile;
  status: ConnectionStatus;
  latency?: number;
}) {
  const color = getIndicatorColor(conn, status);
  return (
    <span
      className={`h-2.5 w-2.5 rounded-full ring-2 ring-background shrink-0 ${status === 'reconnecting' ? 'animate-pulse' : ''}`}
      style={{
        backgroundColor: color,
        boxShadow: status === 'connected' || status === 'slow' ? `0 0 8px ${color}` : 'none',
      }}
      title={getStatusLabel(status, latency)}
    />
  );
}
