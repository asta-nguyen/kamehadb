import type { ConnectionProfile } from '@kamehadb/shared';
import { RefreshCw } from 'lucide-react';

export type ConnectionStatus = 'connected' | 'slow' | 'reconnecting' | 'disconnected';

// Use the connection color when healthy and the same status fallbacks everywhere, including while profiles load.
export function getIndicatorColor(conn: ConnectionProfile | undefined, status: ConnectionStatus | undefined): string {
  if (status === 'connected') return conn?.color || 'var(--success)';
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
  return kind !== 'mongodb' && kind !== 'redis' && kind !== 'qdrant' && kind !== 'tigerbeetle';
}

export function SpinningRefresh({ spinning, className = '' }: { spinning: boolean; className?: string }) {
  return <RefreshCw className={`size-3.5 ${className} ${spinning ? 'animate-spin' : ''}`} />;
}
