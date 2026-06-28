import { ArrowUpDown, BarChart3, Download, FileJson, FileSpreadsheet, List, Search, Table2, X } from 'lucide-react';
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
  onExportJSON,
  onExportCSV,
}: MongoViewHeaderProps) {
  return (
    <div className="px-4 py-2 border-b border-border">
      <div className="flex flex-wrap gap-1.5 items-end">
        <div className="flex-1 min-w-48">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={searchText}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search all fields..."
              className="h-7 pl-7 text-xs"
            />
          </div>
        </div>
        <div className="flex items-end gap-1 self-end">
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
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => onViewModeChange('chart')}
            className={viewMode === 'chart' ? 'bg-muted' : ''}
            title="Chart view"
          >
            <BarChart3 className="size-3.5" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="icon-sm" title="Export" />}>
              <Download className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onExportJSON}>
                <FileJson className="size-3.5 mr-2" />
                Export JSON
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onExportCSV}>
                <FileSpreadsheet className="size-3.5 mr-2" />
                Export CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
