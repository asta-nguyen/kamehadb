import { cn } from '@/lib/utils';
import * as React from 'react';

function Table({ className, ref, ...props }: React.ComponentProps<'div'>) {
  return <div ref={ref} data-slot="table" className={cn('relative w-full', className)} {...props} />;
}
Table.displayName = 'Table';

function TableHeader({ className, ref, ...props }: React.ComponentProps<'div'>) {
  return <div ref={ref} data-slot="table-header" className={cn('[&>div]:border-b', className)} {...props} />;
}
TableHeader.displayName = 'TableHeader';

function TableBody({ className, ref, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      ref={ref}
      data-slot="table-body"
      className={cn('[&>div]:border-b [&>div:last-child]:border-0', className)}
      {...props}
    />
  );
}
TableBody.displayName = 'TableBody';

function TableFooter({ className, ref, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      ref={ref}
      data-slot="table-footer"
      className={cn('border-t bg-muted/50 font-medium [&>div]:border-b-0', className)}
      {...props}
    />
  );
}
TableFooter.displayName = 'TableFooter';

function TableRow({ className, ref, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      ref={ref}
      data-slot="table-row"
      className={cn('grid transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted', className)}
      {...props}
    />
  );
}
TableRow.displayName = 'TableRow';

function TableHead({ className, ref, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      ref={ref}
      data-slot="table-head"
      className={cn(
        'px-2 py-1.5 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-0.5',
        className,
      )}
      {...props}
    />
  );
}
TableHead.displayName = 'TableHead';

function TableCell({ className, colSpan, style, ref, ...props }: React.ComponentProps<'div'> & { colSpan?: number }) {
  return (
    <div
      ref={ref}
      data-slot="table-cell"
      className={cn('p-2 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-0.5', className)}
      style={{ ...(colSpan && colSpan > 1 ? { gridColumn: `span ${colSpan}` } : {}), ...style }}
      {...props}
    />
  );
}
TableCell.displayName = 'TableCell';

function TableCaption({ className, ref, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      ref={ref}
      data-slot="table-caption"
      className={cn('mt-4 text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}
TableCaption.displayName = 'TableCaption';

export { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow };
