import { RedisExplorer } from './redis-explorer';

interface RedisViewProps {
  connectionId: number;
}

export function RedisView({ connectionId }: RedisViewProps) {
  return <RedisExplorer connectionId={connectionId} />;
}
