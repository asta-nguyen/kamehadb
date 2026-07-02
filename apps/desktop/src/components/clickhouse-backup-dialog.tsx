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
import { useClickHouseBackup } from '@/hooks/use-clickhouse-backup';

function isAbsoluteServerPath(value: string): boolean {
  return value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value);
}

type ClickHouseBackupDialogProps = {
  readonly connection: ConnectionProfile;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
};

export function ClickHouseBackupDialog({ connection, open, onOpenChange }: ClickHouseBackupDialogProps) {
  const [outputPath, setOutputPath] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const backup = useClickHouseBackup(connection.id);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && backup.isPending) return;
    if (!nextOpen) {
      setOutputPath('');
      setFormError(null);
      backup.reset();
    }
    onOpenChange(nextOpen);
  };

  const submit = async () => {
    setFormError(null);
    if (!outputPath.trim()) {
      setFormError('Enter a destination path on the ClickHouse server');
      return;
    }
    if (!isAbsoluteServerPath(outputPath.trim())) {
      setFormError('Enter an absolute path on the ClickHouse server');
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
          <DialogTitle>Backup ClickHouse</DialogTitle>
          <DialogDescription>
            Runs <code>BACKUP DATABASE</code> on the server. The archive is written to an absolute path on the{' '}
            <strong>ClickHouse server&apos;s file system</strong>, not the local machine.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Destination path (on the server)</Label>
            <Input
              value={outputPath}
              onChange={(event) => setOutputPath(event.target.value)}
              placeholder="/var/lib/clickhouse/backups/my-backup"
              disabled={backup.isPending}
            />
          </div>

          {formError ? <p className="text-xs text-destructive">{formError}</p> : null}
        </div>

        <DialogFooter>
          <Button onClick={() => void submit()} disabled={backup.isPending}>
            {backup.isPending ? <Spinner size="md" className="mr-2" /> : null}
            Start backup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
