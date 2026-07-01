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
import { Switch } from '@/components/ui/switch';
import { Spinner } from '@/components/ui/spinner';
import { PostgresToolLog } from '@/components/postgres-tool-log';
import { useOracleToolJob } from '@/hooks/use-oracle-tool-job';

type OracleRestoreDialogProps = {
  readonly connection: ConnectionProfile;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
};

export function OracleRestoreDialog({ connection, open, onOpenChange }: OracleRestoreDialogProps) {
  const [directoryObject, setDirectoryObject] = useState('DATA_PUMP_DIR');
  const [dumpFile, setDumpFile] = useState('');
  const [sourceSchema, setSourceSchema] = useState(connection.username ?? '');
  const [targetSchema, setTargetSchema] = useState(connection.username ?? '');
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const job = useOracleToolJob();
  const running = job.state.status === 'running';

  useEffect(() => {
    if (!open) return;
    const nextSchema = connection.username ?? '';
    setSourceSchema(nextSchema);
    setTargetSchema(nextSchema);
  }, [connection.username, open]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && running) return;
    if (!nextOpen) {
      setFormError(null);
      setReplaceExisting(true);
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
    if (!dumpFile.trim()) {
      setFormError('Enter the dump file name');
      return;
    }
    if (!sourceSchema.trim()) {
      setFormError('Enter the source schema from the dump');
      return;
    }
    if (!targetSchema.trim()) {
      setFormError('Enter the target schema to restore into');
      return;
    }
    await job.startRestore({
      connectionId: connection.id,
      directoryObject: directoryObject.trim(),
      dumpFile: dumpFile.trim(),
      sourceSchema: sourceSchema.trim(),
      targetSchema: targetSchema.trim(),
      replaceExisting,
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl" showCloseButton={!running}>
        <DialogHeader>
          <DialogTitle>Restore Oracle Schema</DialogTitle>
          <DialogDescription>
            Runs the local <code>impdp</code> client for the saved Oracle connection. The import reads a dump file from
            an Oracle directory object on the database server.
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
              <Label>Dump file</Label>
              <Input
                value={dumpFile}
                onChange={(event) => setDumpFile(event.target.value)}
                placeholder="kameha-2026-07-02.dmp"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Source schema</Label>
              <Input
                value={sourceSchema}
                onChange={(event) => setSourceSchema(event.target.value)}
                placeholder="KAMEHA"
              />
            </div>
            <div className="space-y-2">
              <Label>Target schema</Label>
              <Input
                value={targetSchema}
                onChange={(event) => setTargetSchema(event.target.value)}
                placeholder="KAMEHA"
              />
            </div>
          </div>

          <div className="rounded-md border bg-muted/20 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <Label>Replace existing tables</Label>
                <p className="text-xs text-muted-foreground">
                  Maps to <code>TABLE_EXISTS_ACTION=REPLACE</code> for Data Pump imports.
                </p>
              </div>
              <Switch checked={replaceExisting} onCheckedChange={setReplaceExisting} />
            </div>
          </div>

          {formError ? <p className="text-xs text-destructive">{formError}</p> : null}
          <PostgresToolLog status={job.state.status} message={job.state.message} logs={job.state.logs} />
        </div>

        <DialogFooter className="items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Requires a local <code>impdp</code> binary in PATH and read access to the chosen directory object.
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
