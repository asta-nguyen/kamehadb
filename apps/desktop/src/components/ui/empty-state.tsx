import type { ComponentType, ReactNode } from 'react';
import { cn } from 'cnfast';

interface EmptyStateProps {
  icon?: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, compact = false, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center text-muted-foreground',
        compact ? 'py-2' : 'py-12',
        className,
      )}
    >
      {Icon && <Icon className={cn(compact ? 'size-5' : 'size-8', 'opacity-40 mb-2')} />}
      <p className={cn(compact ? 'text-xs' : 'text-sm font-medium')}>{title}</p>
      {description && <p className={cn(compact ? 'text-xs mt-0.5' : 'text-xs mt-1')}>{description}</p>}
      {action && <div className={cn(compact ? 'mt-2' : 'mt-4')}>{action}</div>}
    </div>
  );
}
