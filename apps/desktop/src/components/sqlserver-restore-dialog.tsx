import type { ConnectionProfile } from '@kamehadb/shared';
import { useEffect, useState } from 'react';
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
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { useSqlServerRestore } from '@/hooks/use-sqlserver-maintenance';
import { pickSqlServerRestoreInput } from '@/lib/sqlserver-maintenance';

type SqlServerRestoreDialogProps = {
  readonly connection: ConnectionProfile;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
};

export function SqlServerRestoreDialog({ connection, open, onOpenChange }: SqlServerRestoreDialogProps) {
  const [inputPath, setInputPath] = useState('');
  const [targetDatabase, setTargetDatabase] = useState(connection.database ?? '');
  const [confirmed, setConfirmed] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const restore = useSqlServerRestore(connection.id);

  useEffect(() => {
    if (open) {
      setTargetDatabase(connection.database ?? '');
    }
  }, [connection.database, open]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && restore.isPending) {
      return;
    }
    if (!nextOpen) {
      setInputPath('');
      setTargetDatabase(connection.database ?? '');
      setConfirmed(false);
      setFormError(null);
      restore.reset();
    }
    onOpenChange(nextOpen);
  };

  const browse = async () => {
    setFormError(null);
    try {
      const selected = await pickSqlServerRestoreInput();
      if (selected) {
        setInputPath(selected);
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Failed to open the file picker');
    }
  };

  const submit = async () => {
    setFormError(null);
    if (!inputPath.trim()) {
      setFormError('Choose a backup file to restore');
      return;
    }
    if (!targetDatabase.trim()) {
      setFormError('Target database is required');
      return;
    }
    if (!confirmed) {
      setFormError('Confirm that you want to overwrite the target database');
      return;
    }

    try {
      const result = await restore.mutateAsync({
        inputPath: inputPath.trim(),
        targetDatabase: targetDatabase.trim(),
      });
      if (!result.success) {
        setFormError(result.message);
        return;
      }
      handleOpenChange(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Restore failed');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl" showCloseButton={!restore.isPending}>
        <DialogHeader>
          <DialogTitle>Restore SQL Server</DialogTitle>
          <DialogDescription>
            Run RESTORE DATABASE on the connected SQL Server instance. The path must be accessible to the SQL Server
            service account.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Backup file (server-side path)</Label>
            <div className="flex gap-2">
              <Input
                value={inputPath}
                onChange={(event) => setInputPath(event.target.value)}
                placeholder="C:\\backups\\mydb.bak"
              />
              <Button variant="outline" onClick={() => void browse()} disabled={restore.isPending}>
                Browse
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Target database</Label>
            <Input
              value={targetDatabase}
              onChange={(event) => setTargetDatabase(event.target.value)}
              placeholder="Database name to restore into"
            />
          </div>

          <div className="rounded-md border bg-muted/20 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <Label>I understand this overwrites the target database</Label>
                <p className="text-xs text-muted-foreground">
                  RESTORE DATABASE ... WITH REPLACE will overwrite any existing data in the target.
                </p>
              </div>
              <Switch checked={confirmed} onCheckedChange={setConfirmed} />
            </div>
          </div>

          {formError ? <p className="text-xs text-destructive">{formError}</p> : null}
        </div>

        <DialogFooter className="items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            The backup file must be on the SQL Server host, not your local machine.
          </p>
          <Button onClick={() => void submit()} disabled={restore.isPending}>
            {restore.isPending ? <Spinner size="md" className="mr-2" /> : null}
            Start restore
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
