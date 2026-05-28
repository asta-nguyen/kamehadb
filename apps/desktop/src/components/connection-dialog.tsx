import { useCallback, useEffect, useRef } from 'react';
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
import { Loader2, Plug, Plus, Database, File, Server, Box, Leaf, Check } from 'lucide-react';

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

const KIND_ACCENTS: Record<DbKind, { border: string; bg: string; icon: string; ring: string }> = {
  postgres: {
    border: 'hover:border-primary/50',
    bg: 'data-[selected=true]:bg-primary/10',
    icon: 'text-primary',
    ring: 'data-[selected=true]:ring-primary/20',
  },
  sqlite: {
    border: 'hover:border-muted-foreground/50',
    bg: 'data-[selected=true]:bg-muted/50',
    icon: 'text-muted-foreground',
    ring: 'data-[selected=true]:ring-muted-foreground/20',
  },
  mysql: {
    border: 'hover:border-secondary/50',
    bg: 'data-[selected=true]:bg-secondary/50',
    icon: 'text-secondary-foreground',
    ring: 'data-[selected=true]:ring-secondary/20',
  },
  redis: {
    border: 'hover:border-destructive/50',
    bg: 'data-[selected=true]:bg-destructive/10',
    icon: 'text-destructive',
    ring: 'data-[selected=true]:ring-destructive/20',
  },
  mongodb: {
    border: 'hover:border-accent/50',
    bg: 'data-[selected=true]:bg-accent/50',
    icon: 'text-accent-foreground',
    ring: 'data-[selected=true]:ring-accent/20',
  },
};

const KINDS: DbKind[] = ['postgres', 'mysql', 'sqlite', 'redis', 'mongodb'];

const DEFAULT_PORTS: Record<DbKind, number> = {
  postgres: 5432,
  mysql: 3306,
  sqlite: 0,
  redis: 6379,
  mongodb: 0,
};

// Preset colors for connection badges
const PRESET_COLORS = [
  { hex: '#3b82f6', name: 'Blue' },
  { hex: '#10b981', name: 'Emerald' },
  { hex: '#f59e0b', name: 'Amber' },
  { hex: '#ef4444', name: 'Red' },
  { hex: '#8b5cf6', name: 'Violet' },
  { hex: '#ec4899', name: 'Pink' },
  { hex: '#06b6d4', name: 'Cyan' },
  { hex: '#84cc16', name: 'Lime' },
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
  const resetRef = useRef(testConnection.reset);
  resetRef.current = testConnection.reset;

  const form = useForm<CreateConnectionProfileInput>({
    resolver: zodResolver(CreateConnectionProfileSchema) as any,
    mode: 'onChange',
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

  // Auto-hide test connection result after 5 seconds
  useEffect(() => {
    if (!testConnection.data) return;
    const timer = setTimeout(() => {
      resetRef.current();
    }, 5000);
    return () => clearTimeout(timer);
  }, [testConnection.data]);

  const handleUrlChange = useCallback(
    (value: string) => {
      if (!value.trim()) return;
      const parsed = parseConnectionUrl(value);
      if (!parsed) return;
      if (parsed.kind) form.setValue('kind', parsed.kind);
      if (parsed.host !== undefined) form.setValue('host', parsed.host);
      if (parsed.port !== undefined) {
        form.setValue('port', parsed.port);
      } else if (parsed.kind) {
        form.setValue('port', DEFAULT_PORTS[parsed.kind]);
      }
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
      const result = await testConnection.mutateAsync(values);
      if (result.success) {
        toast.success('Connection successful!');
      } else {
        toast.error(result.message || 'Connection failed');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection failed';
      toast.error(message);
    }
  }

  async function handleSubmit(values: CreateConnectionProfileInput) {
    try {
      if (isEditing) {
        await updateConnection.mutateAsync({
          id: editConnection.id,
          input: values,
        });
        toast.success('Connection updated!');
      } else {
        await createConnection.mutateAsync(values);
        toast.success('Connection created!');
      }
      onOpenChange?.(false);
      form.reset();
    } catch (err) {
      // Don't close on error - let user see the error
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button size="sm" className="gap-1.5" />}>
        <Plus className="size-3.5" />
        New
      </DialogTrigger>
      <DialogContent className="sm:max-w-120 max-h-[85vh] overflow-hidden flex flex-col">
        <div className="flex-shrink-0 pr-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">{isEditing ? 'Edit' : 'New Connection'}</DialogTitle>
          </DialogHeader>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 px-1 pr-4 -mr-4 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-5">
            {/* Name Field */}
            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Connection Name
              </Label>
              <Input id="name" {...form.register('name')} placeholder="My Database" className="h-9" />
            </div>

            {/* Database Type */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Database Type</Label>
              <div className="grid grid-cols-5 gap-2">
                {KINDS.map((dbKind) => {
                  const Icon = KIND_ICONS[dbKind];
                  const selected = kind === dbKind;
                  const accent = KIND_ACCENTS[dbKind];
                  return (
                    <button
                      key={dbKind}
                      type="button"
                      data-selected={selected}
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
                          form.setValue('port', DEFAULT_PORTS[dbKind]);
                        }
                      }}
                      className={`
                        group relative flex flex-col items-center justify-center gap-1.5
                        rounded-lg border bg-card p-3 transition-all duration-200
                        hover:shadow-sm active:scale-[0.98]
                        ${accent.border} ${accent.bg} ${accent.ring}
                        data-[selected=true]:border-2 data-[selected=true]:shadow-sm
                        data-[selected=true]:ring-2
                        data-[selected=false]:border-border/50
                      `}
                    >
                      {selected && (
                        <div className="absolute -top-1 -right-1 size-4 rounded-full bg-background border flex items-center justify-center">
                          <Check className={`size-2.5 ${accent.icon}`} strokeWidth={3} />
                        </div>
                      )}
                      <Icon
                        className={`size-5 transition-colors ${selected ? accent.icon : 'text-muted-foreground group-hover:text-foreground'}`}
                      />
                      <span
                        className={`text-xs font-medium transition-colors ${selected ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground/80'}`}
                      >
                        {KIND_LABELS[dbKind]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Color Badge */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Badge Color</Label>
              <div className="flex items-center gap-2 flex-wrap">
                {PRESET_COLORS.map(({ hex, name }) => {
                  const isSelected = selectedColor === hex;
                  return (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => form.setValue('color', isSelected ? undefined : hex)}
                      className={`
                        relative w-7 h-7 rounded-full transition-all duration-200
                        hover:scale-110 active:scale-95
                        ${isSelected ? 'ring-2 ring-offset-2 ring-offset-background' : ''}
                      `}
                      style={{
                        backgroundColor: hex,
                        ['--tw-ring-color' as string]: hex,
                      }}
                      title={name}
                    >
                      {isSelected && <Check className="absolute inset-0 m-auto size-3.5 text-white" strokeWidth={3} />}
                    </button>
                  );
                })}
                {selectedColor && (
                  <button
                    type="button"
                    onClick={() => form.setValue('color', undefined)}
                    className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-border/50 hover:border-border transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Connection Details Section */}
            <div className="space-y-3">
              <div className="h-px bg-border/50" />

              {kind !== 'sqlite' && kind !== 'mongodb' && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Connection URL <span className="font-normal normal-case">(auto-fill fields)</span>
                  </Label>
                  <Input
                    placeholder={`${kind}://user:pass@host:${DEFAULT_PORTS[kind] ?? 3306}/database`}
                    onChange={(e) => handleUrlChange(e.target.value)}
                    className="h-9 font-mono text-xs"
                  />
                </div>
              )}

              {kind === 'mongodb' ? (
                <div className="space-y-1.5">
                  <Label
                    htmlFor="connectionString"
                    className="text-xs font-medium text-muted-foreground uppercase tracking-wide"
                  >
                    Connection String <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="connectionString"
                    {...form.register('connectionString')}
                    placeholder="mongodb://localhost:27017"
                    className="h-9 font-mono text-xs"
                  />
                </div>
              ) : kind === 'sqlite' ? (
                <div className="space-y-1.5">
                  <Label
                    htmlFor="filePath"
                    className="text-xs font-medium text-muted-foreground uppercase tracking-wide"
                  >
                    File Path
                  </Label>
                  <Input
                    id="filePath"
                    {...form.register('filePath')}
                    placeholder="/path/to/database.sqlite"
                    className="h-9 font-mono text-xs"
                  />
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <div className="space-y-1.5">
                      <Label
                        htmlFor="host"
                        className="text-xs font-medium text-muted-foreground uppercase tracking-wide"
                      >
                        Host
                      </Label>
                      <Input id="host" {...form.register('host')} placeholder="localhost" className="h-9" />
                    </div>
                    <div className="space-y-1.5 w-24">
                      <Label
                        htmlFor="port"
                        className="text-xs font-medium text-muted-foreground uppercase tracking-wide"
                      >
                        Port
                      </Label>
                      <Input
                        id="port"
                        type="number"
                        {...form.register('port', { valueAsNumber: true })}
                        className="h-9"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="database"
                      className="text-xs font-medium text-muted-foreground uppercase tracking-wide"
                    >
                      Database
                    </Label>
                    <Input id="database" {...form.register('database')} placeholder="mydb" className="h-9" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label
                        htmlFor="username"
                        className="text-xs font-medium text-muted-foreground uppercase tracking-wide"
                      >
                        Username
                      </Label>
                      <Input
                        id="username"
                        {...form.register('username')}
                        placeholder={kind === 'postgres' ? 'postgres' : 'root'}
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label
                        htmlFor="password"
                        className="text-xs font-medium text-muted-foreground uppercase tracking-wide"
                      >
                        Password {kind === 'postgres' && <span className="text-destructive">*</span>}
                      </Label>
                      <Input
                        id="password"
                        type="password"
                        onChange={(e) => form.setValue('password', e.target.value)}
                        placeholder={isEditing ? '(unchanged)' : ''}
                        className="h-9"
                      />
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-2 pb-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleTest}
                disabled={testConnection.isPending}
                className="gap-1.5"
              >
                {testConnection.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Plug className="size-3.5" />
                )}
                Test
              </Button>
              {testConnection.data && (
                <span className={`text-xs ${testConnection.data.success ? 'text-primary' : 'text-destructive'}`}>
                  {testConnection.data.success
                    ? `Connected (${testConnection.data.serverVersion ?? 'ok'})`
                    : testConnection.data.message}
                </span>
              )}
              <div className="flex-1" />
              <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange?.(false)}>
                Cancel
              </Button>
              <Button size="sm" type="submit" disabled={createConnection.isPending || updateConnection.isPending}>
                {createConnection.isPending || updateConnection.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : null}
                {isEditing ? 'Update' : 'Save'}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
