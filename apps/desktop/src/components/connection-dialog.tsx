import { useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import {
  CreateConnectionProfileSchema,
  type CreateConnectionProfileInput,
  type ConnectionProfile,
  type DbKind,
} from '@kamehadb/shared';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreateConnection, useTestConnection, useUpdateConnection } from '@/hooks/use-connections';
import { Loader2, Plug, Plus, Database, File, Server, Box, Leaf } from 'lucide-react';

const KIND_ICONS: Record<DbKind, typeof Database> = {
  postgres: Database,
  sqlite: File,
  mysql: Server,
  redis: Box,
  mongodb: Leaf,
};

const KIND_LABELS: Record<DbKind, string> = {
  postgres: 'PostgreSQL',
  sqlite: 'SQLite',
  mysql: 'MySQL',
  redis: 'Redis',
  mongodb: 'MongoDB',
};

const KIND_COLORS: Record<DbKind, string> = {
  postgres: 'text-blue-500',
  sqlite: 'text-orange-500',
  mysql: 'text-green-500',
  redis: 'text-red-500',
  mongodb: 'text-emerald-500',
};

const KIND_BG: Record<DbKind, string> = {
  postgres: 'bg-blue-500/10 border-blue-500/20',
  sqlite: 'bg-orange-500/10 border-orange-500/20',
  mysql: 'bg-green-500/10 border-green-500/20',
  redis: 'bg-red-500/10 border-red-500/20',
  mongodb: 'bg-emerald-500/10 border-emerald-500/20',
};

const KINDS: DbKind[] = ['postgres', 'mysql', 'sqlite', 'redis', 'mongodb'];

// Preset colors for connection badges
const PRESET_COLORS = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#84cc16', // lime
];

function parseConnectionUrl(url: string): Partial<CreateConnectionProfileInput> | null {
  try {
    const parsed = new URL(url);
    const protocol = parsed.protocol.replace(':', '');

    let kind: DbKind | null = null;
    if (protocol === 'postgresql' || protocol === 'postgres') kind = 'postgres';
    else if (protocol === 'mysql') kind = 'mysql';
    else if (protocol === 'redis' || protocol === 'rediss') kind = 'redis';
    else if (protocol === 'sqlite') kind = 'sqlite';

    if (!kind) return null;

    const result: Partial<CreateConnectionProfileInput> = {
      kind,
      host: parsed.hostname || undefined,
      port: parsed.port ? Number(parsed.port) : undefined,
      username: parsed.username || undefined,
      password: parsed.password || undefined,
    };

    if (kind === 'sqlite') {
      result.filePath = parsed.pathname || undefined;
      result.host = undefined;
      result.port = undefined;
    } else {
      const db = parsed.pathname.replace(/^\//, '');
      result.database = db || undefined;
    }

    return result;
  } catch {
    return null;
  }
}

interface ConnectionDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  editConnection?: ConnectionProfile | null;
}

export function ConnectionDialog({ open, onOpenChange, editConnection }: ConnectionDialogProps) {
  const isEditing = !!editConnection;
  const createConnection = useCreateConnection();
  const updateConnection = useUpdateConnection();
  const testConnection = useTestConnection();

  const form = useForm<CreateConnectionProfileInput>({
    resolver: zodResolver(CreateConnectionProfileSchema) as any,
    defaultValues: {
      name: editConnection?.name ?? '',
      kind: editConnection?.kind ?? 'postgres',
      host: editConnection?.host ?? 'localhost',
      port: editConnection?.port ?? 5432,
      database: editConnection?.database ?? '',
      username: editConnection?.username ?? '',
      ssl: editConnection?.ssl ?? false,
      color: editConnection?.color ?? undefined,
      connectionString: editConnection?.connectionString ?? undefined,
    },
  });

  const kind = form.watch('kind');
  const selectedColor = form.watch('color');

  const handleUrlChange = useCallback(
    (value: string) => {
      if (!value.trim()) return;
      const parsed = parseConnectionUrl(value);
      if (!parsed) return;
      if (parsed.kind) form.setValue('kind', parsed.kind);
      if (parsed.host !== undefined) form.setValue('host', parsed.host);
      if (parsed.port !== undefined) form.setValue('port', parsed.port);
      if (parsed.database !== undefined) form.setValue('database', parsed.database);
      if (parsed.username !== undefined) form.setValue('username', parsed.username);
      if (parsed.password !== undefined) form.setValue('password', parsed.password);
      if (parsed.filePath !== undefined) form.setValue('filePath', parsed.filePath);
    },
    [form],
  );

  async function handleTest() {
    const values = form.getValues();
    try {
      await testConnection.mutateAsync(values);
      toast.success('Connection successful!');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection failed';
      toast.error(message);
    }
  }

  async function handleSubmit(values: CreateConnectionProfileInput) {
    if (isEditing) {
      await updateConnection.mutateAsync({
        id: editConnection.id,
        input: values,
      });
    } else {
      await createConnection.mutateAsync(values);
    }
    onOpenChange?.(false);
    form.reset();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button size="sm" className="gap-1.5" />}>
        <Plus className="size-3.5" />
        New
      </DialogTrigger>
      <DialogContent className="sm:max-w-120">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Connection' : 'New Connection'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" {...form.register('name')} placeholder="My Database" />
          </div>

          <div className="space-y-2">
            <Label>Type</Label>
            <div className="grid grid-cols-4 gap-2">
              {KINDS.map((dbKind) => {
                const Icon = KIND_ICONS[dbKind];
                const selected = kind === dbKind;
                return (
                  <button
                    key={dbKind}
                    type="button"
                    onClick={() => {
                      form.setValue('kind', dbKind);
                      if (dbKind === 'sqlite' || dbKind === 'mongodb') {
                        form.setValue('host', undefined);
                        form.setValue('port', undefined);
                        form.setValue('database', undefined);
                        form.setValue('username', undefined);
                        form.setValue('password', undefined);
                      } else {
                        form.setValue('filePath', undefined);
                        if (!form.getValues('host')) form.setValue('host', 'localhost');
                      }
                    }}
                    className={`flex flex-col items-center gap-1.5 rounded-lg border p-2.5 transition-all text-xs ${
                      selected
                        ? `border-2 ${KIND_BG[dbKind]} ${KIND_COLORS[dbKind]}`
                        : 'border-border hover:bg-muted text-muted-foreground'
                    }`}
                  >
                    <Icon className={`size-5 ${selected ? KIND_COLORS[dbKind] : ''}`} />
                    <span className="font-medium">{KIND_LABELS[dbKind]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Color Badge</Label>
            <div className="flex items-center gap-2 flex-wrap">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => form.setValue('color', color)}
                  className={`w-6 h-6 rounded-full border-2 transition-all ${
                    selectedColor === color ? 'border-foreground scale-110' : 'border-transparent hover:scale-105'
                  }`}
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
              {selectedColor && (
                <button
                  type="button"
                  onClick={() => form.setValue('color', undefined)}
                  className="text-xs text-muted-foreground hover:text-foreground px-2 py-0.5 rounded border border-border"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {kind !== 'sqlite' && kind !== 'mongodb' && (
            <div className="space-y-2">
              <Label>
                Connection URL <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                placeholder={`${kind}://user:pass@host:${kind === 'redis' ? '6379' : kind === 'postgres' ? '5432' : '3306'}/database`}
                onChange={(e) => handleUrlChange(e.target.value)}
              />
            </div>
          )}

          {kind === 'mongodb' ? (
            <div className="space-y-2">
              <Label htmlFor="connectionString">
                Connection String <span className="text-destructive">*</span>
              </Label>
              <Input
                id="connectionString"
                {...form.register('connectionString')}
                placeholder="mongodb://localhost:27017"
              />
            </div>
          ) : kind !== 'sqlite' ? (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="host">Host</Label>
                  <Input id="host" {...form.register('host')} placeholder="localhost" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="port">Port</Label>
                  <Input id="port" type="number" {...form.register('port', { valueAsNumber: true })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="database">Database</Label>
                <Input id="database" {...form.register('database')} placeholder="mydb" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  {...form.register('username')}
                  placeholder={kind === 'postgres' ? 'postgres' : 'root'}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">
                  Password {kind === 'postgres' && <span className="text-destructive">*</span>}
                </Label>
                <Input
                  id="password"
                  type="password"
                  onChange={(e) => form.setValue('password', e.target.value)}
                  placeholder={isEditing ? '(unchanged)' : ''}
                />
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="filePath">File Path</Label>
              <Input id="filePath" {...form.register('filePath')} placeholder="/path/to/database.sqlite" />
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={handleTest} disabled={testConnection.isPending}>
              {testConnection.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Plug className="size-3.5" />}
              Test Connection
            </Button>
            {testConnection.data && (
              <span className={`text-xs ${testConnection.data.success ? 'text-green-600' : 'text-red-600'}`}>
                {testConnection.data.success
                  ? `Connected (${testConnection.data.serverVersion ?? 'ok'})`
                  : testConnection.data.message}
              </span>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange?.(false)}>
              Cancel
            </Button>
            <Button size="sm" type="submit" disabled={createConnection.isPending || updateConnection.isPending}>
              {(createConnection.isPending || updateConnection.isPending) && (
                <Loader2 className="size-3.5 animate-spin" />
              )}
              {isEditing ? 'Update' : 'Save'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
