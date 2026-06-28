import { Button } from '@/components/ui/button';
import { useRedisCommand } from '@/hooks/use-redis-command';
import { updateTabCommand } from '@/store';
import type { WorkspaceTab } from '@/lib/types';
import type { RedisCommandResult } from '@kamehadb/shared';
import { safeErrorMessage } from '@kamehadb/shared';
import type { Monaco, OnMount } from '@monaco-editor/react';
import { AlertCircle, Clock, Play, Terminal } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { lazy, Suspense, useCallback, useState } from 'react';
const Editor = lazy(() => import('@monaco-editor/react'));

type RedisQueryProps = {
  tab: WorkspaceTab;
  connectionId: string;
};

// Redis commands
const REDIS_COMMANDS = [
  'APPEND',
  'AUTH',
  'BGSAVE',
  'BITCOUNT',
  'BITFIELD',
  'BITOP',
  'BITPOS',
  'BLMPOP',
  'BRPOP',
  'BRPOPLPUSH',
  'CLUSTER',
  'CONFIG',
  'DEBUG',
  'DECR',
  'DECRBY',
  'DEL',
  'DISCARD',
  'DUMP',
  'ECHO',
  'EVAL',
  'EVALSHA',
  'EXISTS',
  'EXPIRE',
  'EXPIREAT',
  'FCALL',
  'FCALLRO',
  'FLUSHALL',
  'FLUSHDB',
  'GEODIST',
  'GEOADD',
  'GEOHASH',
  'GEOPOS',
  'GEORADIUS',
  'GEORADIUSBYMEMBER',
  'GET',
  'GETBIT',
  'GETDEL',
  'GETEX',
  'GETRANGE',
  'HELLO',
  'HSET',
  'HGET',
  'HGETALL',
  'HINCRBY',
  'HINCRBYFLOAT',
  'HKEYS',
  'HLEN',
  'HMGET',
  'HMSET',
  'HSETNX',
  'HSTRLEN',
  'INFO',
  'KILL',
  'LASTSAVE',
  'LCS',
  'LMOVE',
  'LMPOP',
  'LOLWUT',
  'MEMORY',
  'MGET',
  'MONITOR',
  'MOVE',
  'MSET',
  'MSETNX',
  'MULTI',
  'OBJECT',
  'PEXPIRE',
  'PEXPIREAT',
  'PFADD',
  'PFCOUNT',
  'PFMERGE',
  'PING',
  'PSETEX',
  'PSUBSCRIBE',
  'PUBSUB',
  'RANDOMKEY',
  'READONLY',
  'READWRITE',
  'RENAME',
  'RENAMENX',
  'REPLICAOF',
  'RESTORE',
  'RPOP',
  'RPOPLPUSH',
  'RPUSH',
  'RPUSHX',
  'SADD',
  'SAVE',
  'SCAN',
  'SCARD',
  'SDIFF',
  'SDIFFSTORE',
  'SET',
  'SETBIT',
  'SETEX',
  'SETNX',
  'SETRANGE',
  'SHUTDOWN',
  'SINTER',
  'SINTERSTORE',
  'SISMEMBER',
  'SLAVEOF',
  'SLOWLOG',
  'SMEMBERS',
  'SMISMEMBER',
  'SMOVE',
  'SORT',
  'SPOP',
  'SPUBLISH',
  'SSCAN',
  'STRLEN',
  'SUBSCRIBE',
  'SUNION',
  'SUNIONSTORE',
  'SWAPDB',
  'SYNC',
  'TIME',
  'TOUCH',
  'TTL',
  'TYPE',
  'UNLINK',
  'UNSUBSCRIBE',
  'WAIT',
  'WATCH',
  'ZADD',
  'ZCARD',
  'ZCOUNT',
  'ZDIFF',
  'ZDIFFSTORE',
  'ZINCRBY',
  'ZINTER',
  'ZINTERSTORE',
  'ZLEXCOUNT',
  'ZMPOP',
  'ZMSCORE',
  'ZPOPMIN',
  'ZPOPMAX',
  'ZRANGE',
  'ZRANGEBYLEX',
  'ZRANGEBYSCORE',
  'ZRANK',
  'ZRANDMEMBER',
  'ZREMRANGEBYLEX',
  'ZREMRANGEBYRANK',
  'ZREMRANGEBYSCORE',
  'ZREVRANGE',
  'ZREVRANGEBYLEX',
  'ZREVRANGEBYSCORE',
  'ZREVRANK',
  'ZSCAN',
  'ZSCORE',
  'ZUNION',
  'ZUNIONSTORE',
];

function registerRedisLanguage(monaco: Monaco) {
  if (monaco.languages.getLanguages().some((l: { id: string }) => l.id === 'redis')) {
    return;
  }

  monaco.languages.register({ id: 'redis' });

  monaco.languages.setMonarchTokensProvider('redis', {
    tokenizer: {
      root: [
        [new RegExp(`\\b(${REDIS_COMMANDS.join('|')})\\b`, 'i'), 'keyword'],
        [/"[^"]*"/, 'string'],
        [/'[^']*'/, 'string'],
        [/\b\d+\b/, 'number'],
        [/#.*$/, 'comment'],
        [/[\[\]{}():,]/, 'delimiter'],
      ],
    },
  });
}

export function RedisQuery({ tab, connectionId }: RedisQueryProps) {
  const initialCommand = 'command' in tab ? (tab.command ?? '') : '';
  const [command, setCommand] = useState(initialCommand);
  const [result, setResult] = useState<RedisCommandResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const redisCommand = useRedisCommand(connectionId);

  const handleCommandChange = useCallback(
    (value: string) => {
      setCommand(value);
      updateTabCommand(tab.id, value);
    },
    [tab.id],
  );

  const handleRun = useCallback(async () => {
    if (!command.trim()) return;
    setError(null);
    setResult(null);

    try {
      const res = await redisCommand.mutateAsync({ command });
      setResult(res);
    } catch (err) {
      setError(safeErrorMessage(err, 'Command failed'));
    }
  }, [command, redisCommand]);

  const handleEditorDidMount: OnMount = useCallback(
    (editor, monaco) => {
      registerRedisLanguage(monaco);
      editor.focus();

      editor.addAction({
        id: 'run-command',
        label: 'Run Command',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
        run: () => handleRun(),
      });
    },
    [handleRun],
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center px-4 py-2 border-b border-border gap-2 shrink-0">
        <Button size="sm" onClick={handleRun} disabled={redisCommand.isPending} className="gap-1.5">
          {redisCommand.isPending ? <Spinner size="sm" className="size-3.5" /> : <Play className="size-3.5" />}
          Run
        </Button>
        <span className="text-muted-foreground text-xs">
          {redisCommand.isPending ? 'Running...' : 'Ctrl+Enter to run'}
        </span>
      </div>

      <div className="flex-1 min-h-0 border-b border-border">
        <Suspense fallback={<div className="flex-1" />}>
          <Editor
            height="100%"
            language="redis"
            theme="vs-dark"
            value={command}
            onChange={(v) => handleCommandChange(v ?? '')}
            onMount={handleEditorDidMount}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              lineNumbers: 'off',
              scrollBeyondLastLine: false,
              automaticLayout: true,
              padding: { top: 8 },
              wordWrap: 'on',
            }}
          />
        </Suspense>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {redisCommand.isPending && (
          <div className="flex items-center justify-center py-8">
            <Spinner size="lg" />
          </div>
        )}

        {error && (
          <div className="flex items-start p-4 text-destructive text-sm gap-2">
            <AlertCircle className="mt-0.5 shrink-0 size-4" />
            <span>{error}</span>
          </div>
        )}

        {result && (
          <div className="p-4 space-y-3">
            <div className="flex items-center text-muted-foreground text-xs gap-3">
              <span className="flex items-center gap-1">
                <Terminal className="size-3" />
                {result.command}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="size-3" />
                {result.durationMs}ms
              </span>
            </div>
            <div className="p-3 bg-card rounded-md border overflow-auto">
              <pre className="text-xs font-mono break-all whitespace-pre-wrap">
                {typeof result.result === 'string' ? result.result : JSON.stringify(result.result, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
