import type { ReactNode } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { cn } from 'cnfast';
import { Button } from './button';
import { Input } from './input';

interface ExplorerToolbarProps {
  title?: string;
  count?: number;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  actions?: ReactNode;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  className?: string;
}

export function ExplorerToolbar({
  title,
  count,
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Filter...',
  actions,
  onRefresh,
  isRefreshing = false,
  className,
}: ExplorerToolbarProps) {
  const showSearch = searchValue !== undefined && onSearchChange !== undefined;

  return (
    <div className={cn('space-y-1', className)}>
      {(title || onRefresh || actions) && (
        <div className="flex items-center justify-between px-2 py-1">
          {title && (
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {title}
              {count !== undefined && <span className="ml-1 font-normal normal-case">{count}</span>}
            </span>
          )}
          <div className="flex items-center gap-1">
            {actions}
            {onRefresh && (
              <Button variant="ghost" size="icon-xs" onClick={onRefresh} title="Refresh" disabled={isRefreshing}>
                <RefreshCw className={cn('size-3', isRefreshing && 'animate-spin')} />
              </Button>
            )}
          </div>
        </div>
      )}
      {showSearch && (
        <div className="px-2 py-1">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground pointer-events-none" />
            <Input
              type="text"
              value={searchValue}
              onChange={(e) => onSearchChange!(e.target.value)}
              placeholder={searchPlaceholder}
              className="pl-6 pr-2 h-6 text-xs"
            />
          </div>
        </div>
      )}
    </div>
  );
}
