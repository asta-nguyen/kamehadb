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
import { useClickHouseRestore } from '@/hooks/use-clickhouse-backup';

type ClickHouseRestoreDialogProps = {
  readonly connection: ConnectionProfile;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
};

export function ClickHouseRestoreDialog({ connection, open, onOpenChange }: ClickHouseRestoreDialogProps) {
  const [inputPath, setInputPath] = useState('');
  const [targetDatabase, setTargetDatabase] = useState(connection.database ?? '');
  const [formError, setFormError] = useState<string | null>(null);
  const restore = useClickHouseRestore(connection.id);

  useEffect(() => {
    if (!open) return;
    setTargetDatabase(connection.database ?? '');
  }, [connection.database, open]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && restore.isPending) return;
    if (!nextOpen) {
      setInputPath('');
      setFormError(null);
      restore.reset();
    }
    onOpenChange(nextOpen);
  };

  const submit = async () => {
    setFormError(null);
    if (!inputPath.trim()) {
      setFormError('Enter the backup path on the ClickHouse server');
      return;
    }
    if (!targetDatabase.trim()) {
      setFormError('Enter the target database name');
      return;
    }
    try {
      await restore.mutateAsync({ inputPath: inputPath.trim(), targetDatabase: targetDatabase.trim() });
      handleOpenChange(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Restore failed');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl" showCloseButton={!restore.isPending}>
        <DialogHeader>
          <DialogTitle>Restore ClickHouse</DialogTitle>
          <DialogDescription>
            Runs <code>RESTORE DATABASE</code> on the server. Reads the backup archive from an absolute path on the{' '}
            <strong>ClickHouse server&apos;s file system</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Backup path (on the server)</Label>
            <Input
              value={inputPath}
              onChange={(event) => setInputPath(event.target.value)}
              placeholder="/var/lib/clickhouse/backups/my-backup"
              disabled={restore.isPending}
            />
          </div>

          <div className="space-y-2">
            <Label>Target database</Label>
            <Input
              value={targetDatabase}
              onChange={(event) => setTargetDatabase(event.target.value)}
              placeholder="kamehadb"
              disabled={restore.isPending}
            />
          </div>

          {formError ? <p className="text-xs text-destructive">{formError}</p> : null}
        </div>

        <DialogFooter>
          <Button onClick={() => void submit()} disabled={restore.isPending}>
            {restore.isPending ? <Spinner size="md" className="mr-2" /> : null}
            Start restore
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
