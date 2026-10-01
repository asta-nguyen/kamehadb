import { Button } from '@/components/ui/button';
import { ExplorerToolbar } from '@/components/ui/explorer-toolbar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowUpDown, List, Table2, X } from 'lucide-react';

interface MongoViewHeaderProps {
  title: string;
  count: number;
  searchText: string;
  onSearchChange: (v: string) => void;
  sortField: string;
  sortFields: string[];
  onSortFieldChange: (field: string | null) => void;
  onClearSort: () => void;
  showSortClear: boolean;
  viewMode: 'list' | 'table';
  onViewModeChange: (mode: 'list' | 'table') => void;
  isFetching: boolean;
  onRefresh: () => void;
}

export function MongoViewHeader({
  title,
  count,
  searchText,
  onSearchChange,
  sortField,
  sortFields,
  onSortFieldChange,
  onClearSort,
  showSortClear,
  viewMode,
  onViewModeChange,
  isFetching,
  onRefresh,
}: MongoViewHeaderProps) {
  return (
    <div className="border-b border-border">
      <ExplorerToolbar
        title={title}
        count={count}
        searchValue={searchText}
        onSearchChange={onSearchChange}
        searchPlaceholder="Search all fields..."
        onRefresh={onRefresh}
        isRefreshing={isFetching}
        className="px-2 py-1"
        actions={
          <div className="flex items-center gap-1">
            <div className="flex items-center gap-1">
              <Select value={sortField} onValueChange={onSortFieldChange}>
                <SelectTrigger className="h-7 w-28 text-xs gap-1.5 px-2">
                  <ArrowUpDown className="size-3.5 text-muted-foreground" />
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  {sortFields.map((field) => (
                    <SelectItem key={field} value={field} className="text-xs">
                      {field}
                    </SelectItem>
                  ))}
                  <div className="border-t border-border my-1" />
                  <div className="px-2 py-1 text-xs text-muted-foreground">Click again to toggle direction</div>
                </SelectContent>
              </Select>
              {showSortClear && (
                <Button variant="ghost" size="icon-sm" onClick={onClearSort} title="Clear sort">
                  <X className="size-3" />
                </Button>
              )}
            </div>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => onViewModeChange('list')}
              className={viewMode === 'list' ? 'bg-muted' : ''}
              title="List view"
            >
              <List className="size-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => onViewModeChange('table')}
              className={viewMode === 'table' ? 'bg-muted' : ''}
              title="Table view"
            >
              <Table2 className="size-3.5" />
            </Button>
          </div>
        }
      />
    </div>
  );
}
