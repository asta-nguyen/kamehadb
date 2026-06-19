import {
  ArrowUpDown,
  BarChart3,
  Download,
  FileJson,
  FileSpreadsheet,
  List,
  RefreshCw,
  Search,
  Table2,
  Terminal,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface MongoViewHeaderProps {
  searchText: string;
  onSearchChange: (v: string) => void;
  sortField: string;
  sortFields: string[];
  onSortFieldChange: (field: string | null) => void;
  onClearSort: () => void;
  showSortClear: boolean;
  viewMode: 'list' | 'table' | 'chart';
  onViewModeChange: (mode: 'list' | 'table' | 'chart') => void;
  isFetching: boolean;
  onRefresh: () => void;
  onExportJSON: () => void;
  onExportCSV: () => void;
  onOpenShell?: () => void;
}

export function MongoViewHeader({
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
  onExportJSON,
  onExportCSV,
  onOpenShell,
}: MongoViewHeaderProps) {
  return (
    <div className="px-4 py-2 border-b border-border">
      <div className="flex flex-wrap items-end gap-1.5">
        <div className="flex-1 min-w-48">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 size-3.5 text-muted-foreground -translate-y-1/2 pointer-events-none" />
            <Input
              value={searchText}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search all fields..."
              className="pl-7 h-7 text-xs"
            />
          </div>
        </div>
        <div className="flex items-end self-end gap-1">
          <div className="flex items-center gap-1">
            <Select value={sortField} onValueChange={onSortFieldChange}>
              <SelectTrigger className="px-2 h-7 w-28 text-xs gap-1.5">
                <ArrowUpDown className="size-3.5 text-muted-foreground" />
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                {sortFields.map((field) => (
                  <SelectItem key={field} value={field} className="text-xs">
                    {field}
                  </SelectItem>
                ))}
                <div className="my-1 border-t border-border" />
                <div className="px-2 py-1 text-xs text-muted-foreground">Click again to toggle direction</div>
              </SelectContent>
            </Select>
            {showSortClear && (
              <Button variant="ghost" size="icon" onClick={onClearSort} className="h-7 w-7" title="Clear sort">
                <X className="size-3" />
              </Button>
            )}
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => onViewModeChange('list')}
            className={viewMode === 'list' ? 'bg-muted' : ''}
            title="List view"
          >
            <List className="size-3.5!" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => onViewModeChange('table')}
            className={viewMode === 'table' ? 'bg-muted' : ''}
            title="Table view"
          >
            <Table2 className="size-3.5!" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => onViewModeChange('chart')}
            className={viewMode === 'chart' ? 'bg-muted' : ''}
            title="Chart view"
          >
            <BarChart3 className="size-3.5!" />
          </Button>
          <Button variant="outline" size="icon" onClick={onRefresh} disabled={isFetching} title="Refresh">
            <RefreshCw className={`!size-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
          {onOpenShell && (
            <Button variant="outline" size="icon" onClick={onOpenShell} title="Open Mongo Shell">
              <Terminal className="size-3.5!" />
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center justify-center size-8 bg-background rounded-lg border-input border hover:text-foreground hover:bg-muted">
              <Download className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onExportJSON}>
                <FileJson className="mr-2 size-3.5" />
                Export JSON
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onExportCSV}>
                <FileSpreadsheet className="mr-2 size-3.5" />
                Export CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
