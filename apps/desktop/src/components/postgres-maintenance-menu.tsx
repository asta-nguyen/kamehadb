import { Download, Terminal, Upload } from 'lucide-react';

import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { isTauriRuntime } from '@/lib/tauri';

type PostgresMaintenanceMenuProps = {
  readonly onOpenPsql: () => void;
  readonly onOpenBackup: () => void;
  readonly onOpenRestore: () => void;
};

export function PostgresMaintenanceMenu({ onOpenPsql, onOpenBackup, onOpenRestore }: PostgresMaintenanceMenuProps) {
  if (!isTauriRuntime()) {
    return null;
  }

  return (
    <>
      <DropdownMenuItem onClick={onOpenPsql}>
        <Terminal className="mr-2 size-3.5" />
        Open PSQL
      </DropdownMenuItem>
      <DropdownMenuItem onClick={onOpenBackup}>
        <Download className="mr-2 size-3.5" />
        Backup
      </DropdownMenuItem>
      <DropdownMenuItem onClick={onOpenRestore}>
        <Upload className="mr-2 size-3.5" />
        Restore
      </DropdownMenuItem>
    </>
  );
}
