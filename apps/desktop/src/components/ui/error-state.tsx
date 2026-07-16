import { AlertCircle, RotateCw } from 'lucide-react';
import { cn } from 'cnfast';
import { Button } from './button';

interface ErrorStateProps {
  error: Error | string | unknown;
  onRetry?: () => void;
  compact?: boolean;
  className?: string;
}

function getErrorMessage(error: Error | string | unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Failed to load';
}

export function ErrorState({ error, onRetry, compact = false, className }: ErrorStateProps) {
  const message = getErrorMessage(error);

  if (compact) {
    return (
      <div role="alert" className={cn('flex items-start gap-1.5 text-destructive text-xs', className)}>
        <AlertCircle className="mt-0.5 shrink-0 size-3" />
        <span className="break-all">{message}</span>
      </div>
    );
  }

  return (
    <div role="alert" className={cn('flex flex-col items-center justify-center py-8 text-destructive', className)}>
      <div className="flex items-center gap-2">
        <AlertCircle className="size-5 shrink-0" />
        <span className="text-sm">{message}</span>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-4">
          <RotateCw className="size-3.5" />
          Retry
        </Button>
      )}
    </div>
  );
}
