import { useEffect, useState } from 'react';
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
import { Spinner } from '@/components/ui/spinner';
import { PostgresToolLog } from '@/components/postgres-tool-log';
import { defaultOracleDumpFile } from '@/lib/oracle-maintenance';
import { useOracleToolJob } from '@/hooks/use-oracle-tool-job';

type OracleBackupDialogProps = {
  readonly connection: ConnectionProfile;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
};

export function OracleBackupDialog({ connection, open, onOpenChange }: OracleBackupDialogProps) {
  const [directoryObject, setDirectoryObject] = useState('DATA_PUMP_DIR');
  const [schema, setSchema] = useState(connection.username ?? '');
  const [dumpFile, setDumpFile] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const job = useOracleToolJob();
  const running = job.state.status === 'running';

  useEffect(() => {
    if (!open) return;
    const nextSchema = connection.username ?? '';
    setSchema(nextSchema);
    setDumpFile(defaultOracleDumpFile(nextSchema));
  }, [connection.username, open]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && running) return;
    if (!nextOpen) {
      setFormError(null);
      job.reset();
    }
    onOpenChange(nextOpen);
  };

  const submit = async () => {
    setFormError(null);
    if (!directoryObject.trim()) {
      setFormError('Enter the Oracle directory object name');
      return;
    }
    if (!schema.trim()) {
      setFormError('Enter the schema to export');
      return;
    }
    if (!dumpFile.trim()) {
      setFormError('Enter the dump file name');
      return;
    }
    await job.startBackup({
      connectionId: connection.id,
      directoryObject: directoryObject.trim(),
      dumpFile: dumpFile.trim(),
      schema: schema.trim(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl" showCloseButton={!running}>
        <DialogHeader>
          <DialogTitle>Backup Oracle Schema</DialogTitle>
          <DialogDescription>
            Runs the local <code>expdp</code> client for the saved Oracle connection. The dump is written into an Oracle
            directory object on the database server, not a file path on this machine.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Directory object</Label>
              <Input
                value={directoryObject}
                onChange={(event) => setDirectoryObject(event.target.value)}
                placeholder="DATA_PUMP_DIR"
              />
            </div>
            <div className="space-y-2">
              <Label>Schema</Label>
              <Input value={schema} onChange={(event) => setSchema(event.target.value)} placeholder="KAMEHA" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Dump file</Label>
            <Input
              value={dumpFile}
              onChange={(event) => setDumpFile(event.target.value)}
              placeholder="kameha-2026-07-02.dmp"
            />
          </div>

          {formError ? <p className="text-xs text-destructive">{formError}</p> : null}
          <PostgresToolLog status={job.state.status} message={job.state.message} logs={job.state.logs} />
        </div>

        <DialogFooter className="items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Requires a local <code>expdp</code> binary in PATH and write access to the chosen directory object.
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
