import { type ConnectionProfile, KIND } from '@kamehadb/shared';
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
import { useFileDatabaseBackup } from '@/hooks/use-file-database-maintenance';
import { pickFileDatabaseBackupDestination } from '@/lib/file-database-maintenance';

type FileDatabaseBackupDialogProps = {
  readonly connection: ConnectionProfile;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
};

export function FileDatabaseBackupDialog({ connection, open, onOpenChange }: FileDatabaseBackupDialogProps) {
  const [outputPath, setOutputPath] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const backup = useFileDatabaseBackup(connection.id);

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
      const selected = await pickFileDatabaseBackupDestination(connection);
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
      await backup.mutateAsync({ outputPath: outputPath.trim() });
      handleOpenChange(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Backup failed');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl" showCloseButton={!backup.isPending}>
        <DialogHeader>
          <DialogTitle>Backup {connection.kind === KIND.SQLITE ? 'SQLite' : 'DuckDB'}</DialogTitle>
          <DialogDescription>
            Save a backup of the configured database file to another location on disk.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Destination file</Label>
            <div className="flex gap-2">
              <Input
                value={outputPath}
                onChange={(event) => setOutputPath(event.target.value)}
                placeholder="Choose a backup file path"
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
            The current connection is closed before the file is copied so the backup stays consistent.
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
