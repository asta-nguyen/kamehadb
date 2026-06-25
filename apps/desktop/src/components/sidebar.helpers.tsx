import { type ConnectionProfile, isSqlKind } from '@kamehadb/shared';
import { RefreshCw } from 'lucide-react';

export type ConnectionStatus = 'connected' | 'slow' | 'reconnecting' | 'disconnected';

export function getIndicatorColor(conn: ConnectionProfile, status: ConnectionStatus) {
  if (status === 'connected') return conn.color || '#22c55e';
  if (status === 'slow') return '#eab308';
  if (status === 'reconnecting') return '#f97316';
  return '#ef4444';
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
