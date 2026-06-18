import { Loader2 } from 'lucide-react';

type SpinnerSize = 'sm' | 'md' | 'lg';

const sizeClasses: Record<SpinnerSize, string> = {
  sm: 'size-3',
  md: 'size-4',
  lg: 'size-5',
};

export function Spinner({ size = 'md', className = '' }: { size?: SpinnerSize; className?: string }) {
  return <Loader2 className={`animate-spin text-muted-foreground ${sizeClasses[size]} ${className}`.trim()} />;
}
