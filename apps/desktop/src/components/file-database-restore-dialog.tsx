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
import { Switch } from '@/components/ui/switch';
import { useFileDatabaseRestore } from '@/hooks/use-file-database-maintenance';
import { pickFileDatabaseRestoreInput } from '@/lib/file-database-maintenance';

type FileDatabaseRestoreDialogProps = {
  readonly connection: ConnectionProfile;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
};

export function FileDatabaseRestoreDialog({ connection, open, onOpenChange }: FileDatabaseRestoreDialogProps) {
  const [inputPath, setInputPath] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const restore = useFileDatabaseRestore(connection.id);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && restore.isPending) {
      return;
    }
    if (!nextOpen) {
      setInputPath('');
      setConfirmed(false);
      setFormError(null);
      restore.reset();
    }
    onOpenChange(nextOpen);
  };

  const browse = async () => {
    setFormError(null);
    try {
      const selected = await pickFileDatabaseRestoreInput(connection);
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
    if (!confirmed) {
      setFormError('Confirm that you want to overwrite the configured database file');
      return;
    }

    try {
      await restore.mutateAsync({ inputPath: inputPath.trim() });
      handleOpenChange(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Restore failed');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl" showCloseButton={!restore.isPending}>
        <DialogHeader>
          <DialogTitle>Restore {connection.kind === KIND.SQLITE ? 'SQLite' : 'DuckDB'}</DialogTitle>
          <DialogDescription>
            Replace the configured database file with a backup from disk. The current connection is closed first, and
            the app refreshes after the restore finishes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Backup file</Label>
            <div className="flex gap-2">
              <Input
                value={inputPath}
                onChange={(event) => setInputPath(event.target.value)}
                placeholder="Choose a backup file"
              />
              <Button variant="outline" onClick={() => void browse()} disabled={restore.isPending}>
                Browse
              </Button>
            </div>
          </div>

          <div className="rounded-md border bg-muted/20 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <Label>I understand this overwrites the current database file</Label>
                <p className="text-xs text-muted-foreground">
                  Restore into a disposable copy if you need to verify the backup before replacing the active file.
                </p>
              </div>
              <Switch checked={confirmed} onCheckedChange={setConfirmed} />
            </div>
          </div>

          {formError ? <p className="text-xs text-destructive">{formError}</p> : null}
        </div>

        <DialogFooter className="items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            This operation rewrites the file configured for this connection.
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
