import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { api } from '@/lib/api';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ReleaseInfo } from '@/lib/update-check';

export type UpdateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  release: ReleaseInfo | null;
  currentVersion: string;
  onDismiss?: () => void;
};

// Render release details and changelog markdown, allowing direct external download
// or version-specific dismissal. (How / Why / What)
export function UpdateDialog({ open, onOpenChange, release, currentVersion, onDismiss }: UpdateDialogProps) {
  if (!release) return null;

  const publishedDate = release.publishedAt
    ? new Date(release.publishedAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null;

  const handleDownload = () => {
    api.openBrowser(release.htmlUrl);
    onOpenChange(false);
  };

  const handleDismiss = () => {
    onDismiss?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader className="gap-1">
          <div className="flex items-center gap-2">
            <DialogTitle className="text-base font-semibold">Update Available</DialogTitle>
            <Badge
              variant="outline"
              className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400 font-mono text-xs"
            >
              {release.tagName}
            </Badge>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            A new version of KamehaDB is available. You are running{' '}
            <span className="font-mono text-foreground">{currentVersion}</span>.
            {publishedDate && <span> Released on {publishedDate}.</span>}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Release Notes</span>
          <div className="max-h-64 overflow-y-auto rounded-md border border-border bg-muted/20 p-3 text-xs">
            {release.body ? (
              <div className="prose prose-sm dark:prose-invert max-w-none text-xs leading-relaxed space-y-2">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{release.body}</ReactMarkdown>
              </div>
            ) : (
              <p className="text-muted-foreground italic">No release notes provided for this version.</p>
            )}
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Don't show for this version
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Later
            </Button>
            <Button
              size="sm"
              onClick={handleDownload}
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
            >
              <Download className="size-3.5" />
              Download Update
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
