import { RedisExplorer } from './redis-explorer';

interface RedisViewProps {
  connectionId: string;
}

export function RedisView({ connectionId }: RedisViewProps) {
  return <RedisExplorer connectionId={connectionId} />;
}
