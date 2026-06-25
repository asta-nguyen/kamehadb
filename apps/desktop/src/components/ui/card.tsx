import { cn } from 'cnfast';
import * as React from 'react';

function Card({ className, ref, ...props }: React.ComponentProps<'div'>) {
  return (
    <div ref={ref} className={cn('rounded-lg border bg-card text-card-foreground shadow-sm', className)} {...props} />
  );
}
Card.displayName = 'Card';

function CardHeader({ className, ref, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      ref={ref}
      className={cn('flex flex-col space-y-[var(--d-card-gap)] p-[var(--d-card-p)]', className)}
      {...props}
    />
  );
}
CardHeader.displayName = 'CardHeader';

function CardTitle({ className, ref, ...props }: React.ComponentProps<'h3'>) {
  return <h3 ref={ref} className={cn('font-semibold leading-none tracking-tight', className)} {...props} />;
}
CardTitle.displayName = 'CardTitle';

function CardDescription({ className, ref, ...props }: React.ComponentProps<'p'>) {
  return <p ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />;
}
CardDescription.displayName = 'CardDescription';

function CardContent({ className, ref, ...props }: React.ComponentProps<'div'>) {
  return <div ref={ref} className={cn('p-[var(--d-card-p)] pt-0', className)} {...props} />;
}
CardContent.displayName = 'CardContent';

function CardFooter({ className, ref, ...props }: React.ComponentProps<'div'>) {
  return <div ref={ref} className={cn('flex items-center p-[var(--d-card-p)] pt-0', className)} {...props} />;
}
CardFooter.displayName = 'CardFooter';

export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
