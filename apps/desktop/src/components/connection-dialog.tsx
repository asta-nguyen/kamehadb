import { useCallback, useEffect, useRef } from 'react';
import { Controller, useForm, type UseFormReturn } from 'react-hook-form';
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
import { Switch } from '@/components/ui/switch';
import { useCreateConnection, useTestConnection, useUpdateConnection } from '@/hooks/use-connections';
import { Plug, Plus, Check, FolderOpen } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { DbIcon } from '@/components/db-icon';
import { KIND_LABELS, KINDS, DEFAULT_PORTS, PRESET_COLORS } from '@/lib/constants';

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
    ring: 'data-[selected=true]:ring-accent-foreground/20',
  },
  qdrant: {
    border: 'hover:border-primary/50',
    bg: 'data-[selected=true]:bg-primary/10',
    icon: 'text-primary',
    ring: 'data-[selected=true]:ring-primary/20',
  },
  sqlserver: {
    border: 'hover:border-blue-500/50',
    bg: 'data-[selected=true]:bg-blue-500/10',
    icon: 'text-blue-500',
    ring: 'data-[selected=true]:ring-blue-500/20',
  },
  oracle: {
    border: 'hover:border-red-500/50',
    bg: 'data-[selected=true]:bg-red-500/10',
    icon: 'text-red-500',
    ring: 'data-[selected=true]:ring-red-500/20',
  },
  clickhouse: {
    border: 'hover:border-yellow-500/50',
    bg: 'data-[selected=true]:bg-yellow-500/10',
    icon: 'text-yellow-500',
    ring: 'data-[selected=true]:ring-yellow-500/20',
  },
  mariadb: {
    border: 'hover:border-cyan-500/50',
    bg: 'data-[selected=true]:bg-cyan-500/10',
    icon: 'text-cyan-500',
    ring: 'data-[selected=true]:ring-cyan-500/20',
  },
  duckdb: {
    border: 'hover:border-emerald-500/50',
    bg: 'data-[selected=true]:bg-emerald-500/10',
    icon: 'text-emerald-500',
    ring: 'data-[selected=true]:ring-emerald-500/20',
  },
  tigerbeetle: {
    border: 'hover:border-orange-500/50',
    bg: 'data-[selected=true]:bg-orange-500/10',
    icon: 'text-orange-500',
    ring: 'data-[selected=true]:ring-orange-500/20',
  },
};

function parseConnectionUrl(url: string): Partial<CreateConnectionProfileInput> | null {
  try {
    const parsed = new URL(url);
    const protocol = parsed.protocol.replace(':', '');

    let kind: DbKind | null = null;
    if (protocol === 'postgresql' || protocol === 'postgres') kind = 'postgres';
    else if (protocol === 'mysql') kind = 'mysql';
    else if (protocol === 'redis' || protocol === 'rediss') kind = 'redis';
    else if (protocol === 'sqlite') kind = 'sqlite';
    else if (protocol === 'qdrant') kind = 'qdrant';

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

function selectKind(form: UseFormReturn<CreateConnectionProfileInput>, dbKind: DbKind) {
  form.setValue('kind', dbKind);
  if (dbKind === 'sqlite' || dbKind === 'mongodb' || dbKind === 'duckdb') {
    form.setValue('host', undefined);
    form.setValue('port', undefined);
    form.setValue('database', undefined);
    form.setValue('username', undefined);
    form.setValue('password', undefined);
  } else if (dbKind === 'qdrant') {
    // URL-only: host + port, no auth/database fields
    form.setValue('filePath', undefined);
    form.setValue('database', undefined);
    form.setValue('username', undefined);
    form.setValue('password', undefined);
    if (!form.getValues('host')) form.setValue('host', 'localhost');
    form.setValue('port', DEFAULT_PORTS[dbKind]);
  } else {
    form.setValue('filePath', undefined);
    if (!form.getValues('host')) form.setValue('host', 'localhost');
    form.setValue('port', DEFAULT_PORTS[dbKind]);
  }
}

function DatabaseTypeGrid({ form, kind }: { form: UseFormReturn<CreateConnectionProfileInput>; kind: DbKind }) {
  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground font-medium tracking-wide uppercase">Database Type</Label>
      <div className="grid grid-cols-3 gap-2">
        {KINDS.map((dbKind) => {
          const selected = kind === dbKind;
          const accent = KIND_ACCENTS[dbKind];
          return (
            <Button
              key={dbKind}
              type="button"
              data-selected={selected}
              onClick={() => selectKind(form, dbKind)}
              className={`
                group relative flex flex-col items-center justify-center gap-1.5
                rounded-lg border bg-card p-3 h-auto transition-all duration-200
                hover:shadow-sm active:scale-[0.98]
                ${accent.border} ${accent.bg} ${accent.ring}
                data-[selected=true]:border-2 data-[selected=true]:shadow-sm
                data-[selected=true]:ring-2
                data-[selected=false]:border-border/50
              `}
            >
              {selected && (
                <div className="absolute flex items-center justify-center size-4 bg-background rounded-full -top-1 -right-1 border">
                  <Check className={`size-2.5 ${accent.icon}`} strokeWidth={3} />
                </div>
              )}
              <DbIcon
                kind={dbKind}
                className={`size-5 transition-colors ${selected ? accent.icon : 'text-muted-foreground group-hover:text-foreground'}`}
              />
              <span
                className={`text-xs font-medium transition-colors ${selected ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground/80'}`}
              >
                {KIND_LABELS[dbKind]}
              </span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}

function BadgeColorPicker({
  form,
  selectedColor,
}: {
  form: UseFormReturn<CreateConnectionProfileInput>;
  selectedColor?: string;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground font-medium tracking-wide uppercase">Badge Color</Label>
      <div className="flex items-center flex-wrap gap-2">
        {PRESET_COLORS.map(({ hex, name }) => {
          const isSelected = selectedColor === hex;
          return (
            <Button
              key={hex}
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => form.setValue('color', isSelected ? undefined : hex)}
              className={`rounded-full transition-all duration-200 hover:scale-110 active:scale-95 ${isSelected ? 'ring-2 ring-offset-2 ring-offset-background' : ''}`}
              style={{
                backgroundColor: hex,
                ['--tw-ring-color' as string]: hex,
              }}
              title={name}
            >
              {isSelected && <Check className="absolute m-auto size-3.5 text-white inset-0" strokeWidth={3} />}
            </Button>
          );
        })}
        <label
          className={`
            relative w-7 h-7 rounded-full cursor-pointer transition-all duration-200
            hover:scale-110 active:scale-95 border border-dashed border-border
            ${selectedColor && !PRESET_COLORS.some((p) => p.hex === selectedColor) ? 'ring-2 ring-offset-2 ring-offset-background' : ''}
          `}
          style={{ ['--tw-ring-color' as string]: selectedColor ?? '' }}
          title="Custom color"
        >
          <input
            type="color"
            value={selectedColor && !PRESET_COLORS.some((p) => p.hex === selectedColor) ? selectedColor : '#3b82f6'}
            onChange={(e) => form.setValue('color', e.target.value)}
            className="absolute w-full h-full opacity-0 inset-0 cursor-pointer"
          />
          {selectedColor && !PRESET_COLORS.some((p) => p.hex === selectedColor) ? (
            <span className="absolute rounded-full inset-0" style={{ backgroundColor: selectedColor }} />
          ) : (
            <Plus className="absolute m-auto size-3.5 text-muted-foreground inset-0" strokeWidth={2} />
          )}
        </label>
        {selectedColor && (
          <Button type="button" variant="outline" size="sm" onClick={() => form.setValue('color', undefined)}>
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}

function ReadonlyToggle({ form }: { form: UseFormReturn<CreateConnectionProfileInput> }) {
  return (
    <Controller
      control={form.control}
      name="readonly"
      render={({ field }) => (
        <div className="flex items-center justify-between p-3 bg-card/50 rounded-lg border-border/50 border">
          <div className="pr-4 space-y-0.5">
            <Label htmlFor="readonly" className="text-sm font-medium">
              Read-only
            </Label>
            <p className="text-xs text-muted-foreground">
              Block CREATE, INSERT, UPDATE, DELETE, DROP and other write statements.
            </p>
          </div>
          <Switch id="readonly" checked={field.value ?? true} onCheckedChange={field.onChange} />
        </div>
      )}
    />
  );
}

function ConnectionDetailsSection({
  form,
  kind,
  onUrlChange,
  fileInputRef,
  isEditing,
}: {
  form: UseFormReturn<CreateConnectionProfileInput>;
  kind: DbKind;
  onUrlChange: (value: string) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  isEditing: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="h-px bg-border/50" />

      {kind !== 'sqlite' && kind !== 'mongodb' && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground font-medium tracking-wide uppercase">
            Connection URL <span className="font-normal normal-case">(auto-fill fields)</span>
          </Label>
          <Input
            placeholder={`${kind}://user:pass@host:${DEFAULT_PORTS[kind] ?? 3306}/database`}
            onChange={(e) => onUrlChange(e.target.value)}
            className="h-9 text-xs font-mono"
          />
        </div>
      )}

      {kind === 'mongodb' ? (
        <div className="space-y-1.5">
          <Label
            htmlFor="connectionString"
            className="text-xs text-muted-foreground font-medium tracking-wide uppercase"
          >
            Connection String <span className="text-destructive">*</span>
          </Label>
          <Input
            id="connectionString"
            {...form.register('connectionString')}
            placeholder="mongodb://localhost:27017"
            className="h-9 text-xs font-mono"
          />
        </div>
      ) : kind === 'sqlite' || kind === 'duckdb' ? (
        <div className="space-y-1.5">
          <Label htmlFor="filePath" className="text-xs text-muted-foreground font-medium tracking-wide uppercase">
            Database File
          </Label>
          <div className="flex gap-2">
            <Input
              id="filePath"
              {...form.register('filePath')}
              placeholder="/path/to/database.sqlite"
              className="h-9 text-xs font-mono"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="h-9 gap-1.5 shrink-0"
            >
              <FolderOpen className="size-3.5" />
              Browse
            </Button>
            <Input
              ref={fileInputRef}
              type="file"
              accept=".db,.sqlite,.sqlite3,.sqlite2,*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  // In Tauri, File has a path property
                  const path = (file as any).path || file.name;
                  form.setValue('filePath', path);
                }
                e.target.value = '';
              }}
            />
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="host" className="text-xs text-muted-foreground font-medium tracking-wide uppercase">
                Host
              </Label>
              <Input id="host" {...form.register('host')} placeholder="localhost" className="h-9" />
            </div>
            <div className="w-24 space-y-1.5">
              <Label htmlFor="port" className="text-xs text-muted-foreground font-medium tracking-wide uppercase">
                Port
              </Label>
              <Input id="port" type="number" {...form.register('port', { valueAsNumber: true })} className="h-9" />
            </div>
          </div>
          {kind !== 'qdrant' && kind !== 'tigerbeetle' && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="database" className="text-xs text-muted-foreground font-medium tracking-wide uppercase">
                  Database
                </Label>
                <Input id="database" {...form.register('database')} placeholder="mydb" className="h-9" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="username"
                    className="text-xs text-muted-foreground font-medium tracking-wide uppercase"
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
                    className="text-xs text-muted-foreground font-medium tracking-wide uppercase"
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
          {kind === 'tigerbeetle' && (
            <div className="space-y-1.5">
              <Label htmlFor="database" className="text-xs text-muted-foreground font-medium tracking-wide uppercase">
                Cluster ID
              </Label>
              <Input id="database" {...form.register('database')} placeholder="0" className="h-9" />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function DialogActions({
  isEditing,
  isTesting,
  testMessage,
  testSuccess,
  testServerVersion,
  isSaving,
  onCancel,
  onTest,
}: {
  isEditing: boolean;
  isTesting: boolean;
  testMessage?: string;
  testSuccess?: boolean;
  testServerVersion?: string;
  isSaving: boolean;
  onCancel: () => void;
  onSubmit: () => void;
  onTest: () => void;
}) {
  return (
    <div className="flex items-center pt-2 pb-1 gap-3">
      <Button type="button" variant="outline" size="sm" onClick={onTest} disabled={isTesting} className="gap-1.5">
        {isTesting ? <Spinner size="sm" className="size-3.5" /> : <Plug className="size-3.5" />}
        Test
      </Button>
      {testMessage != null && (
        <span className={`text-xs ${testSuccess ? 'text-primary' : 'text-destructive'}`}>
          {testSuccess ? `Connected (${testServerVersion ?? 'ok'})` : testMessage}
        </span>
      )}
      <div className="flex-1" />
      <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
        Cancel
      </Button>
      <Button size="sm" type="submit" disabled={isSaving}>
        {isSaving ? <Spinner size="sm" className="size-3.5" /> : null}
        {isEditing ? 'Update' : 'Save'}
      </Button>
    </div>
  );
}

export function ConnectionDialog({ open, onOpenChange, editConnection }: ConnectionDialogProps) {
  const isEditing = !!editConnection;
  const createConnection = useCreateConnection();
  const updateConnection = useUpdateConnection();
  const testConnection = useTestConnection();
  const resetRef = useRef(testConnection.reset);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
      readonly: editConnection?.readonly ?? true,
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

  // Auto-fill name and auto-test when SQLite file is selected
  const filePath = form.watch('filePath');
  useEffect(() => {
    if (kind !== 'sqlite' || !filePath) return;

    // Auto-fill name from filename if empty
    const name = form.getValues('name');
    if (!name) {
      const fileName =
        filePath
          .split(/[\\/]/)
          .pop()
          ?.replace(/\.[^.]+$/, '') || filePath;
      form.setValue('name', fileName);
    }

    // Auto-test connection
    const timer = setTimeout(async () => {
      try {
        await testConnection.mutateAsync({
          kind: 'sqlite',
          filePath,
          name: 'test',
          readonly: true,
        });
      } catch {
        // Ignore auto-test errors
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [filePath, kind, form, testConnection]);

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
      <DialogContent className="flex flex-col max-h-[85vh] overflow-hidden sm:max-w-lg">
        <div className="pr-6 shrink-0">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">{isEditing ? 'Edit' : 'New Connection'}</DialogTitle>
          </DialogHeader>
        </div>

        <div className="flex-1 pr-4 min-h-0 overflow-y-auto -mr-4 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-5">
            {/* Name Field */}
            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-xs text-muted-foreground font-medium tracking-wide uppercase">
                Connection Name
              </Label>
              <Input id="name" {...form.register('name')} placeholder="My Database" className="h-9" />
            </div>

            <DatabaseTypeGrid form={form} kind={kind} />
            <BadgeColorPicker form={form} selectedColor={selectedColor} />
            <ReadonlyToggle form={form} />
            <ConnectionDetailsSection
              form={form}
              kind={kind}
              onUrlChange={handleUrlChange}
              fileInputRef={fileInputRef}
              isEditing={isEditing}
            />

            <DialogActions
              isEditing={isEditing}
              isTesting={testConnection.isPending}
              testMessage={testConnection.data?.message}
              testSuccess={testConnection.data?.success}
              testServerVersion={testConnection.data?.serverVersion}
              isSaving={createConnection.isPending || updateConnection.isPending}
              onCancel={() => onOpenChange?.(false)}
              onSubmit={() => form.handleSubmit(handleSubmit)()}
              onTest={handleTest}
            />
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
