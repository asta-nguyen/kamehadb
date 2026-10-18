import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Spinner } from '@/components/ui/spinner';
import { UpdateDialog } from '@/components/update-dialog';
import { useUpdateCheck } from '@/hooks/use-update-check';
import { toastInfo, toastError } from '@/lib/toast';

// Settings section for managing automatic update checks, checking immediately on demand,
// and inspecting the currently running version. (How / Why / What)
export function UpdateSettingsSection() {
  const updateCheck = useUpdateCheck();
  const [checking, setChecking] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleCheckNow = async () => {
    setChecking(true);
    try {
      const res = await updateCheck.checkNow();
      if (res.status === 'update-available') {
        setDialogOpen(true);
      } else if (res.status === 'up-to-date') {
        toastInfo(`KamehaDB is up to date (${res.latestVersion})`);
      } else if (res.status === 'error') {
        toastError(`Failed to check for updates: ${res.message}`);
      }
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-3 rounded-sm border border-border p-3 text-xs">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-0.5">
          <Label className="text-sm font-medium">Check for updates automatically</Label>
          <p className="text-xs text-muted-foreground">
            Periodically check GitHub releases every 6 hours for new KamehaDB versions.
          </p>
        </div>
        <Switch
          checked={updateCheck.checkForUpdatesEnabled}
          onCheckedChange={updateCheck.setCheckForUpdatesEnabled}
          aria-label="Check for updates automatically"
        />
      </div>

      <div className="flex items-center justify-between border-t border-border/60 pt-2 text-muted-foreground">
        <div>
          <span>Current version: </span>
          <span className="font-mono text-foreground">{updateCheck.currentVersion}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="xs"
            onClick={updateCheck.previewUpdate}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Preview update notice
          </Button>
          <Button
            variant="outline"
            size="xs"
            onClick={handleCheckNow}
            disabled={checking || updateCheck.isChecking}
            className="gap-1.5"
          >
            {checking || updateCheck.isChecking ? (
              <Spinner size="sm" className="size-3" />
            ) : (
              <RefreshCw className="size-3" />
            )}
            Check for updates
          </Button>
        </div>
      </div>

      <UpdateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        release={updateCheck.release}
        currentVersion={updateCheck.currentVersion}
        onDismiss={updateCheck.dismissUpdate}
      />
    </div>
  );
}
