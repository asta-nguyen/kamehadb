import { Terminal } from 'lucide-react';

import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { isTauriRuntime } from '@/lib/tauri';

type PostgresMaintenanceMenuProps = {
  readonly onOpenPsql: () => void;
};

export function PostgresMaintenanceMenu({ onOpenPsql }: PostgresMaintenanceMenuProps) {
  if (!isTauriRuntime()) {
    return null;
  }

  return (
    <>
      <DropdownMenuItem onClick={onOpenPsql}>
        <Terminal className="mr-2 size-3.5" />
        Open PSQL
      </DropdownMenuItem>
    </>
  );
}
