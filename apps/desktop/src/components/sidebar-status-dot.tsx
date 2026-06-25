import type { ConnectionProfile } from '@kamehadb/shared';
import { useStore } from '@tanstack/react-store';
import { appStore } from '@/store';
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
  const themeStyle = useStore(appStore, (s) => s.themePreset.style);
  const color = getIndicatorColor(conn, status);
  const label = getStatusLabel(status, latency);

  // macOS Cheetah: small Aqua gel dot with bevel, no glow
  if (themeStyle === 'macosx') {
    return (
      <span
        className={`h-2.5 w-2.5 rounded-full shrink-0 ${status === 'reconnecting' ? 'animate-pulse' : ''}`}
        style={{
          backgroundColor: color,
          border: '1px solid rgba(0, 0, 0, 0.3)',
          boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.5)',
        }}
        title={label}
      />
    );
  }

  return (
    <span
      className={`h-2.5 w-2.5 rounded-full ring-2 ring-background shrink-0 ${status === 'reconnecting' ? 'animate-pulse' : ''}`}
      style={{
        backgroundColor: color,
        boxShadow: status === 'connected' || status === 'slow' ? `0 0 8px ${color}` : 'none',
      }}
      title={label}
    />
  );
}
