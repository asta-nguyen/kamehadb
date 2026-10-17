import type { ConnectionProfile } from '@kamehadb/shared';
import { isSqlKind } from '@/lib/kinds';
import { RefreshCw } from 'lucide-react';

export type ConnectionStatus = 'connected' | 'slow' | 'reconnecting' | 'disconnected';

// Status indicator colors strictly reflect connectivity health so custom profile
// accent colors don't mislead users into thinking connections are degraded or offline. (How / Why / What)
export function getIndicatorColor(_conn: ConnectionProfile | undefined, status: ConnectionStatus | undefined): string {
  if (status === 'connected') return 'var(--success)';
  if (status === 'slow') return 'var(--warning)';
  if (status === 'reconnecting') return 'var(--warning)';
  if (status === 'disconnected') return 'var(--destructive)';
  return 'var(--muted-foreground)';
}

export function getStatusLabel(status: ConnectionStatus, latency?: number) {
  if (status === 'connected' && latency !== undefined) return `Connected • ${latency}ms`;
  if (status === 'slow') return `Slow • ${latency ?? ''}ms`;
  if (status === 'reconnecting') return 'Reconnecting…';
  return 'Offline';
}

export function isSqlLike(kind: string) {
  return isSqlKind(kind);
}

export function SpinningRefresh({ spinning, className = '' }: { spinning: boolean; className?: string }) {
  return <RefreshCw className={`size-3.5 ${className} ${spinning ? 'animate-spin' : ''}`} />;
}
