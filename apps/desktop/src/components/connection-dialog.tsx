import { useCallback, useEffect, useRef } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import {
  CreateConnectionProfileSchema,
  EditConnectionProfileSchema,
  KIND,
  type CreateConnectionProfileInput,
  type ConnectionProfile,
  type DbKind,
} from '@kamehadb/shared';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { useCreateConnection, useTestConnection, useUpdateConnection } from '@/hooks/use-connections';
import { Plus } from 'lucide-react';
import { DEFAULT_PORTS, TOAST_AUTO_HIDE_MS } from '@/lib/constants';
import {
  DatabaseTypeGrid,
  BadgeColorPicker,
  ConnectionDetailsSection,
  DialogActions,
} from '@/components/connection-dialog-fields';

function parseConnectionUrl(url: string): Partial<CreateConnectionProfileInput> | null {
  try {
    const parsed = new URL(url);
    const protocol = parsed.protocol.replace(':', '');

    let kind: DbKind | null = null;
    if (protocol === 'postgresql' || protocol === KIND.POSTGRES) kind = KIND.POSTGRES;
    else if (protocol === 'mysql') kind = KIND.MYSQL;
    else if (protocol === 'redis' || protocol === 'rediss') kind = KIND.REDIS;
    else if (protocol === 'sqlite') kind = KIND.SQLITE;
    else if (protocol === 'qdrant') kind = KIND.QDRANT;

    if (!kind) return null;

    const result: Partial<CreateConnectionProfileInput> = {
      kind,
      host: parsed.hostname || undefined,
      port: parsed.port ? Number(parsed.port) : undefined,
      username: parsed.username || undefined,
      password: parsed.password || undefined,
    };

    if (kind === KIND.SQLITE) {
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  resetRef.current = testConnection.reset;

  const form = useForm<CreateConnectionProfileInput>({
    resolver: zodResolver(
      isEditing ? EditConnectionProfileSchema : CreateConnectionProfileSchema,
    ) as Resolver<CreateConnectionProfileInput>,
    mode: 'onChange',
    defaultValues: {
      name: editConnection?.name ?? '',
      kind: editConnection?.kind ?? KIND.POSTGRES,
      host: editConnection?.host ?? 'localhost',
      port: editConnection?.port ?? DEFAULT_PORTS[KIND.POSTGRES],
      database: editConnection?.database ?? '',
      username: editConnection?.username ?? '',
      ssl: editConnection?.ssl ?? false,
      color: editConnection?.color ?? undefined,
      connectionString: editConnection?.connectionString ?? undefined,
      filePath: editConnection?.filePath ?? undefined,
    },
  });

  // Reset form when editConnection changes (e.g. opening edit dialog for a different connection)
  useEffect(() => {
    if (editConnection) {
      form.reset({
        name: editConnection.name,
        kind: editConnection.kind,
        host: editConnection.host ?? 'localhost',
        port: editConnection.port ?? DEFAULT_PORTS[KIND.POSTGRES],
        database: editConnection.database ?? '',
        username: editConnection.username ?? '',
        ssl: editConnection.ssl ?? false,
        color: editConnection.color ?? undefined,
        connectionString: editConnection.connectionString ?? undefined,
        filePath: editConnection.filePath ?? undefined,
      });
    }
  }, [editConnection, form]);

  const kind = form.watch('kind') as DbKind;
  const selectedColor = form.watch('color');

  // Auto-hide test connection result after 5 seconds
  useEffect(() => {
    if (!testConnection.data) return;
    const timer = setTimeout(() => {
      resetRef.current();
    }, TOAST_AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [testConnection.data]);

  // Auto-fill name and auto-test when SQLite file is selected
  const filePath = form.watch('filePath');
  useEffect(() => {
    if (kind !== KIND.SQLITE || !filePath) return;

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
          kind: KIND.SQLITE,
          filePath,
          name: 'test',
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
        form.setValue('port', DEFAULT_PORTS[parsed.kind as DbKind]);
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
      {!isEditing && (
        <DialogTrigger render={<Button size="sm" className="gap-1.5" />}>
          <Plus className="size-3.5" />
          New
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
        <div className="shrink-0 pr-6">
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
              <Input id="name" {...form.register('name')} placeholder="My Database" />
            </div>

            <DatabaseTypeGrid form={form} kind={kind} />
            <BadgeColorPicker form={form} selectedColor={selectedColor} />
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
              onTest={handleTest}
            />
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
