import { useState } from 'react';
import type { ConnectionProfile } from '@kamehadb/shared';
import { usePostgresToolJob } from '@/hooks/use-postgres-tool-job';
import { pickRestoreInput } from '@/lib/postgres-maintenance';
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
import { Switch } from '@/components/ui/switch';
import { PostgresToolLog } from '@/components/postgres-tool-log';
import { Spinner } from '@/components/ui/spinner';
import { useEffect } from 'react';

type PostgresRestoreDialogProps = {
  readonly connection: ConnectionProfile;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
};

export function PostgresRestoreDialog({ connection, open, onOpenChange }: PostgresRestoreDialogProps) {
  const [inputPath, setInputPath] = useState('');
  const [targetDatabase, setTargetDatabase] = useState(connection.database ?? '');
  const [clean, setClean] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const job = usePostgresToolJob();

  useEffect(() => {
    if (open) setTargetDatabase(connection.database ?? '');
  }, [connection.database, open]);
  const running = job.state.status === 'running';

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && running) return;
    if (!nextOpen) {
      setFormError(null);
      setConfirmed(false);
      setClean(false);
      job.reset();
    }
    onOpenChange(nextOpen);
  };

  const browse = async () => {
    setFormError(null);
    try {
      const selected = await pickRestoreInput();
      if (selected) setInputPath(selected);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Failed to open the file picker');
    }
  };

  const submit = async () => {
    setFormError(null);
    if (!inputPath.trim()) {
      setFormError('Choose a dump file to restore');
      return;
    }
    if (!targetDatabase.trim()) {
      setFormError('Enter the target database name');
      return;
    }
    if (!confirmed) {
      setFormError('Confirm that you understand restore can modify the target database');
      return;
    }
    await job.startRestore({
      connectionId: connection.id,
      inputPath: inputPath.trim(),
      targetDatabase: targetDatabase.trim(),
      clean,
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl" showCloseButton={!running}>
        <DialogHeader>
          <DialogTitle>Restore PostgreSQL</DialogTitle>
          <DialogDescription>
            Restore a PostgreSQL dump with the local <code>pg_restore</code> or <code>psql</code> binary, depending on
            the file format. This operation can overwrite objects in the target database.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Dump file</Label>
            <div className="flex gap-2">
              <Input
                value={inputPath}
                onChange={(event) => setInputPath(event.target.value)}
                placeholder="Choose a dump file"
              />
              <Button variant="outline" onClick={() => void browse()} disabled={running}>
                Browse
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Target database</Label>
            <Input
              value={targetDatabase}
              onChange={(event) => setTargetDatabase(event.target.value)}
              placeholder="postgres database name"
            />
          </div>

          <div className="rounded-md border bg-muted/20 p-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <Label>Clean existing objects first</Label>
                <p className="text-xs text-muted-foreground">
                  Applies to custom and tar dumps restored through <code>pg_restore</code>.
                </p>
              </div>
              <Switch checked={clean} onCheckedChange={setClean} />
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <Label>I understand this can modify data</Label>
                <p className="text-xs text-muted-foreground">
                  Use a disposable database or a known-good backup when testing restores.
                </p>
              </div>
              <Switch checked={confirmed} onCheckedChange={setConfirmed} />
            </div>
          </div>

          {formError ? <p className="text-xs text-destructive">{formError}</p> : null}
          <PostgresToolLog status={job.state.status} message={job.state.message} logs={job.state.logs} />
        </div>

        <DialogFooter className="items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Requires local <code>pg_restore</code> and <code>psql</code> binaries in PATH.
          </p>
          <div className="flex items-center gap-2">
            {running ? (
              <Button variant="outline" onClick={() => void job.cancel()}>
                Cancel
              </Button>
            ) : null}
            <Button onClick={() => void submit()} disabled={running}>
              {running ? <Spinner size="md" className="mr-2" /> : null}
              Start restore
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
