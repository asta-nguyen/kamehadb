import type { ConnectionProfile } from '@kamehadb/shared';
import { useState } from 'react';
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
import { useSqlServerBackup } from '@/hooks/use-sqlserver-maintenance';
import { pickSqlServerBackupDestination } from '@/lib/sqlserver-maintenance';

type SqlServerBackupDialogProps = {
  readonly connection: ConnectionProfile;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
};

export function SqlServerBackupDialog({ connection, open, onOpenChange }: SqlServerBackupDialogProps) {
  const [outputPath, setOutputPath] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const backup = useSqlServerBackup(connection.id);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && backup.isPending) {
      return;
    }
    if (!nextOpen) {
      setOutputPath('');
      setFormError(null);
      backup.reset();
    }
    onOpenChange(nextOpen);
  };

  const browse = async () => {
    setFormError(null);
    try {
      const selected = await pickSqlServerBackupDestination(connection);
      if (selected) {
        setOutputPath(selected);
      }
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

    try {
      const result = await backup.mutateAsync({ outputPath: outputPath.trim() });
      if (!result.success) {
        setFormError(result.message);
        return;
      }
      handleOpenChange(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Backup failed');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl" showCloseButton={!backup.isPending}>
        <DialogHeader>
          <DialogTitle>Backup SQL Server</DialogTitle>
          <DialogDescription>
            Run BACKUP DATABASE on the connected SQL Server instance. The path must be accessible to the SQL Server
            service account.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Destination file (server-side path)</Label>
            <div className="flex gap-2">
              <Input
                value={outputPath}
                onChange={(event) => setOutputPath(event.target.value)}
                placeholder="C:\\backups\\mydb.bak"
              />
              <Button variant="outline" onClick={() => void browse()} disabled={backup.isPending}>
                Browse
              </Button>
            </div>
          </div>

          {formError ? <p className="text-xs text-destructive">{formError}</p> : null}
        </div>

        <DialogFooter className="items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            The backup file is created on the SQL Server host, not your local machine.
          </p>
          <Button onClick={() => void submit()} disabled={backup.isPending}>
            {backup.isPending ? <Spinner size="md" className="mr-2" /> : null}
            Start backup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
