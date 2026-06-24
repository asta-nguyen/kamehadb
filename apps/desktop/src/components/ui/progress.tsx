import { cn } from 'cnfast';
import * as React from 'react';

function Progress({ className, ref, value = 0, ...props }: React.ComponentProps<'div'> & { value?: number }) {
  return (
    <div
      ref={ref}
      data-slot="progress"
      className={cn('relative h-2 w-full overflow-hidden rounded-full bg-primary/20', className)}
      {...props}
    >
      <div
        data-slot="progress-indicator"
        className="h-full bg-primary transition-all"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

export { Progress };
