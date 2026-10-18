import { useState } from 'react';
import { Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UpdateDialog } from '@/components/update-dialog';
import type { ReleaseInfo } from '@/lib/update-check';

export type SidebarUpdateNoticeProps = {
  release: ReleaseInfo | null;
  currentVersion: string;
  updateAvailable: boolean;
  onDismiss: (tagName?: string) => void;
};

// Compact footer bar with glowing dot and download icon alerting when a newer release
// is available; clicking opens the release dialog and an inline button allows quick dismissal. (How / Why / What)
export function SidebarUpdateNotice({ release, currentVersion, updateAvailable, onDismiss }: SidebarUpdateNoticeProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  if (!updateAvailable || !release) {
    return null;
  }

  return (
    <>
      <div
        data-slot="sidebar-update"
        id="sidebar-update"
        className="sidebar-update group flex items-center justify-between border-t border-border bg-emerald-500/10 px-2.5 py-1.5 text-xs transition-colors hover:bg-emerald-500/15 cursor-pointer select-none shrink-0"
        onClick={() => setDialogOpen(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setDialogOpen(true);
          }
        }}
        title={`Click to view details for ${release.tagName}`}
        aria-label={`Update available: ${release.tagName}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="size-2 shrink-0 rounded-full bg-emerald-500" />
          <Download className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span className="truncate font-medium text-foreground">
            Update available <span className="font-mono text-muted-foreground">({release.tagName})</span>
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          className="size-5 text-muted-foreground/60 hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss(release.tagName);
          }}
          title="Dismiss notice"
          aria-label="Dismiss notice"
        >
          <X className="size-3" />
        </Button>
      </div>

      <UpdateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        release={release}
        currentVersion={currentVersion}
        onDismiss={() => onDismiss(release.tagName)}
      />
    </>
  );
}
