import { cn } from '@/lib/utils';

// Sanitize an inline SVG icon (from thesvg/simple-icons) so it scales
// to its container instead of collapsing to 0px.
export function BrandIcon({ icon, className }: { icon: { svg: string }; className?: string }) {
  return (
    <span
      className={cn('inline-flex items-center justify-center overflow-hidden', className)}
      dangerouslySetInnerHTML={{
        __html: icon.svg
          .replace(/width='[^']*'/g, "width='100%'")
          .replace(/width="[^"]*"/g, 'width="100%"')
          .replace(/height='[^']*'/g, "height='100%'")
          .replace(/height="[^"]*"/g, 'height="100%"')
          .replace(
            /<svg/,
            '<svg style="width:100%;height:100%;max-width:100%;max-height:100%" preserveAspectRatio="xMidYMid meet"',
          ),
      }}
    />
  );
}
