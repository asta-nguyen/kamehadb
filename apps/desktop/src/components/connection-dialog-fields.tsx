import type { UseFormReturn } from 'react-hook-form';
import { type CreateConnectionProfileInput, type DbKind, KIND, isPasswordRequired } from '@kamehadb/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Check, Plus, FolderOpen } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { DbIcon } from '@/components/db-icon';
import { KIND_LABELS, KINDS, DEFAULT_PORTS, PRESET_COLORS } from '@/lib/constants';

const KIND_ACCENTS: Record<DbKind, { border: string; bg: string; icon: string; ring: string }> = {
  [KIND.POSTGRES]: {
    border: 'hover:border-primary/50',
    bg: 'data-[selected=true]:bg-primary/10',
    icon: 'text-primary',
    ring: 'data-[selected=true]:ring-primary/20',
  },
  [KIND.SQLITE]: {
    border: 'hover:border-muted-foreground/50',
    bg: 'data-[selected=true]:bg-muted/50',
    icon: 'text-muted-foreground',
    ring: 'data-[selected=true]:ring-muted-foreground/20',
  },
  [KIND.MYSQL]: {
    border: 'hover:border-secondary/50',
    bg: 'data-[selected=true]:bg-secondary/50',
    icon: 'text-secondary-foreground',
    ring: 'data-[selected=true]:ring-secondary/20',
  },
  [KIND.REDIS]: {
    border: 'hover:border-destructive/50',
    bg: 'data-[selected=true]:bg-destructive/10',
    icon: 'text-destructive',
    ring: 'data-[selected=true]:ring-destructive/20',
  },
  [KIND.MONGODB]: {
    border: 'hover:border-accent/50',
    bg: 'data-[selected=true]:bg-accent/50',
    icon: 'text-accent-foreground',
    ring: 'data-[selected=true]:ring-accent-foreground/20',
  },
  [KIND.QDRANT]: {
    border: 'hover:border-primary/50',
    bg: 'data-[selected=true]:bg-primary/10',
    icon: 'text-primary',
    ring: 'data-[selected=true]:ring-primary/20',
  },
  [KIND.SQLSERVER]: {
    border: 'hover:border-blue-500/50',
    bg: 'data-[selected=true]:bg-blue-500/10',
    icon: 'text-blue-500',
    ring: 'data-[selected=true]:ring-blue-500/20',
  },
  [KIND.ORACLE]: {
    border: 'hover:border-red-500/50',
    bg: 'data-[selected=true]:bg-red-500/10',
    icon: 'text-red-500',
    ring: 'data-[selected=true]:ring-red-500/20',
  },
  [KIND.CLICKHOUSE]: {
    border: 'hover:border-yellow-500/50',
    bg: 'data-[selected=true]:bg-yellow-500/10',
    icon: 'text-yellow-500',
    ring: 'data-[selected=true]:ring-yellow-500/20',
  },
  [KIND.MARIADB]: {
    border: 'hover:border-cyan-500/50',
    bg: 'data-[selected=true]:bg-cyan-500/10',
    icon: 'text-cyan-500',
    ring: 'data-[selected=true]:ring-cyan-500/20',
  },
  [KIND.DUCKDB]: {
    border: 'hover:border-emerald-500/50',
    bg: 'data-[selected=true]:bg-emerald-500/10',
    icon: 'text-emerald-500',
    ring: 'data-[selected=true]:ring-emerald-500/20',
  },
  [KIND.TIGERBEETLE]: {
    border: 'hover:border-orange-500/50',
    bg: 'data-[selected=true]:bg-orange-500/10',
    icon: 'text-orange-500',
    ring: 'data-[selected=true]:ring-orange-500/20',
  },
};

function selectKind(form: UseFormReturn<CreateConnectionProfileInput>, dbKind: DbKind) {
  form.setValue('kind', dbKind);
  if (dbKind === KIND.SQLITE || dbKind === KIND.MONGODB || dbKind === KIND.DUCKDB) {
    form.setValue('host', undefined);
    form.setValue('port', undefined);
    form.setValue('database', undefined);
    form.setValue('username', undefined);
    form.setValue('password', undefined);
  } else if (dbKind === KIND.QDRANT) {
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

export function DatabaseTypeGrid({ form, kind }: { form: UseFormReturn<CreateConnectionProfileInput>; kind: DbKind }) {
  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Database Type</Label>
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
                <div className="absolute -top-1 -right-1 size-4 rounded-full bg-background border flex items-center justify-center">
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

export function BadgeColorPicker({
  form,
  selectedColor,
}: {
  form: UseFormReturn<CreateConnectionProfileInput>;
  selectedColor?: string;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Badge Color</Label>
      <div className="flex items-center gap-2 flex-wrap">
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
              {isSelected && <Check className="absolute inset-0 m-auto size-3.5 text-white" strokeWidth={3} />}
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
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          {selectedColor && !PRESET_COLORS.some((p) => p.hex === selectedColor) ? (
            <span className="absolute inset-0 rounded-full" style={{ backgroundColor: selectedColor }} />
          ) : (
            <Plus className="absolute inset-0 m-auto size-3.5 text-muted-foreground" strokeWidth={2} />
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

export function ConnectionDetailsSection({
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

      {kind !== KIND.SQLITE && kind !== KIND.MONGODB && (
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Connection URL <span className="font-normal normal-case">(auto-fill fields)</span>
          </Label>
          <Input
            placeholder={`${kind}://user:pass@host:${DEFAULT_PORTS[kind]}/database`}
            onChange={(e) => onUrlChange(e.target.value)}
            className="font-mono text-xs"
          />
        </div>
      )}

      {kind === KIND.MONGODB ? (
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
            className="font-mono text-xs"
          />
        </div>
      ) : kind === KIND.SQLITE || kind === KIND.DUCKDB ? (
        <div className="space-y-1.5">
          <Label htmlFor="filePath" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Database File <span className="text-destructive">*</span>
          </Label>
          <div className="flex gap-2">
            <Input
              id="filePath"
              {...form.register('filePath')}
              placeholder="/path/to/database.sqlite"
              className="font-mono text-xs"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="gap-1.5 shrink-0"
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
              <Label htmlFor="host" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Host
              </Label>
              <Input id="host" {...form.register('host')} placeholder="localhost" />
            </div>
            <div className="space-y-1.5 w-24">
              <Label htmlFor="port" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Port
              </Label>
              <Input
                id="port"
                type="number"
                {...form.register('port', { valueAsNumber: true })}
                className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
          </div>
          {kind !== KIND.QDRANT && kind !== KIND.TIGERBEETLE && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="database" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Database
                </Label>
                <Input id="database" {...form.register('database')} placeholder="mydb" />
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
                    placeholder={kind === KIND.POSTGRES ? 'postgres' : 'root'}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="password"
                    className="text-xs font-medium text-muted-foreground uppercase tracking-wide"
                  >
                    Password {isPasswordRequired(kind) && <span className="text-destructive">*</span>}
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    onChange={(e) => form.setValue('password', e.target.value)}
                    placeholder={isEditing ? '(unchanged)' : ''}
                  />
                </div>
              </div>
            </>
          )}
          {kind === KIND.TIGERBEETLE && (
            <div className="space-y-1.5">
              <Label htmlFor="database" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Cluster ID
              </Label>
              <Input id="database" {...form.register('database')} placeholder="0" />
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function DialogActions({
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
  onTest: () => void;
}) {
  return (
    <div className="flex items-center gap-3 pt-2 pb-1">
      <Button type="button" variant="outline" size="sm" onClick={onTest} disabled={isTesting} className="gap-1.5">
        {isTesting ? <Spinner size="sm" className="size-3.5" /> : null}
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
