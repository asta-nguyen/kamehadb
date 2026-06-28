import { cn } from 'cnfast';
import { Spinner } from './spinner';

interface LoadingStateProps {
  size?: 'sm' | 'md' | 'lg';
  compact?: boolean;
  className?: string;
}

export function LoadingState({ size = 'md', compact = false, className }: LoadingStateProps) {
  return (
    <div className={cn('flex items-center justify-center', compact ? 'py-2' : 'py-8', className)}>
      <Spinner size={size} />
    </div>
  );
}
