import type { ConnectionProfile } from '@kamehadb/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PostgresToolLog } from '@/components/postgres-tool-log';
import { useMysqlToolJob } from '@/hooks/use-mysql-tool-job';
import { useTables } from '@/hooks/use-schema';
import {
  MYSQL_BACKUP_FORMATS,
  pickBackupDestination,
  type MysqlBackupFormat,
  type MysqlBackupScope,
} from '@/lib/mysql-maintenance';
import { Spinner } from '@/components/ui/spinner';
import { useEffect, useMemo, useState } from 'react';

type BackupScopeKind = 'database' | 'table';

type MysqlBackupDialogProps = {
  readonly connection: ConnectionProfile;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
};

const BACKUP_SCOPE_KINDS = ['database', 'table'] as const;

function isBackupScopeKind(value: string | null): value is BackupScopeKind {
  return value !== null && BACKUP_SCOPE_KINDS.some((kind) => kind === value);
}

function isMysqlBackupFormat(value: string | null): value is MysqlBackupFormat {
  return value !== null && MYSQL_BACKUP_FORMATS.some((format) => format === value);
}

export function MysqlBackupDialog({ connection, open, onOpenChange }: MysqlBackupDialogProps) {
  const [scopeKind, setScopeKind] = useState<BackupScopeKind>('database');
  const [tableName, setTableName] = useState('');
  const [format, setFormat] = useState<MysqlBackupFormat>('sql');
  const [outputPath, setOutputPath] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  // Only fetch tables when the dialog is open and table scope is active,
  // so closed sidebar instances don't issue a request per MySQL connection.
  const tablesConnectionId = open && scopeKind === 'table' ? connection.id : null;
  const { data: tables } = useTables(tablesConnectionId, undefined);
  const job = useMysqlToolJob();
  const running = job.state.status === 'running';

  useEffect(() => {
    if (!open || scopeKind !== 'table') return;
    if (!tableName && tables && tables.length > 0) {
      setTableName(tables[0].name);
    }
  }, [open, scopeKind, tableName, tables]);

  const scope = useMemo<MysqlBackupScope | null>(() => {
    if (scopeKind === 'database') return { kind: 'database' };
    if (!tableName) return null;
    return { kind: 'table', table: tableName };
  }, [scopeKind, tableName]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && running) return;
    if (!nextOpen) {
      setFormError(null);
      job.reset();
    }
    onOpenChange(nextOpen);
  };

  const browse = async () => {
    setFormError(null);
    try {
      const selected = await pickBackupDestination(connection, format);
      if (selected) setOutputPath(selected);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Failed to open the save dialog');
    }
  };

  const submit = async () => {
    setFormError(null);
    if (!outputPath.trim()) {
      setFormError('Choose a destination file');
      return;
    }
    if (!scope) {
      setFormError('Choose a valid backup scope');
      return;
    }
    await job.startBackup({
      connectionId: connection.id,
      outputPath: outputPath.trim(),
      format,
      scope,
    });
  };

  const engineLabel = connection.kind === 'mariadb' ? 'MariaDB' : 'MySQL';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl" showCloseButton={!running}>
        <DialogHeader>
          <DialogTitle>Backup {engineLabel}</DialogTitle>
          <DialogDescription>
            Create a {engineLabel} dump with the local <code>mysqldump</code> binary. Credentials are read from the
            saved connection and never written into the log output.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Scope</Label>
              <Select
                value={scopeKind}
                onValueChange={(value) => {
                  if (isBackupScopeKind(value)) {
                    setScopeKind(value);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="database">Database</SelectItem>
                  <SelectItem value="table">Table</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Format</Label>
              <Select
                value={format}
                onValueChange={(value) => {
                  if (isMysqlBackupFormat(value)) {
                    setFormat(value);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sql">Plain SQL (.sql)</SelectItem>
                  <SelectItem value="xml">XML (.xml)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {scopeKind === 'table' && (
            <div className="space-y-2">
              <Label>Table</Label>
              <Select value={tableName} onValueChange={(value) => setTableName(value ?? '')}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a table" />
                </SelectTrigger>
                <SelectContent>
                  {(tables ?? []).map((table) => (
                    <SelectItem key={table.id} value={table.name}>
                      {table.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Destination file</Label>
            <div className="flex gap-2">
              <Input
                value={outputPath}
                onChange={(event) => setOutputPath(event.target.value)}
                placeholder="Choose a dump file path"
              />
              <Button variant="outline" onClick={() => void browse()} disabled={running}>
                Browse
              </Button>
            </div>
          </div>

          {formError ? <p className="text-xs text-destructive">{formError}</p> : null}
          <PostgresToolLog status={job.state.status} message={job.state.message} logs={job.state.logs} />
        </div>

        <DialogFooter className="items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Requires a local <code>mysqldump</code> binary in PATH.
          </p>
          <div className="flex items-center gap-2">
            {running ? (
              <Button variant="outline" onClick={() => void job.cancel()}>
                Cancel
              </Button>
            ) : null}
            <Button onClick={() => void submit()} disabled={running}>
              {running ? <Spinner size="md" className="mr-2" /> : null}
              Start backup
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
