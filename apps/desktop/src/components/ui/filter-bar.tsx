import { Plus, X } from 'lucide-react';
import { cn } from 'cnfast';
import { Button } from './button';
import { Input } from './input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';

export interface FilterEntry {
  column: string;
  operator: string;
  value: string;
}

interface FilterBarProps {
  filters: FilterEntry[];
  columns: string[];
  onChange: (filters: FilterEntry[]) => void;
  className?: string;
}

const OPERATORS = ['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'ILIKE', 'IS NULL', 'IS NOT NULL'];

export function FilterBar({ filters, columns, onChange, className }: FilterBarProps) {
  const addFilter = () => {
    onChange([...filters, { column: columns[0] ?? '', operator: '=', value: '' }]);
  };

  const removeFilter = (index: number) => {
    onChange(filters.filter((_, i) => i !== index));
  };

  const updateFilter = (index: number, field: keyof FilterEntry, value: string) => {
    onChange(filters.map((f, i) => (i === index ? { ...f, [field]: value } : f)));
  };

  const isNullOp = (op: string) => op === 'IS NULL' || op === 'IS NOT NULL';

  return (
    <div className={cn('space-y-1.5', className)}>
      {filters.map((filter, index) => (
        <div key={index} className="flex items-center gap-1.5">
          <Select value={filter.column} onValueChange={(v) => updateFilter(index, 'column', v ?? '')}>
            <SelectTrigger className="h-7 w-28 text-xs gap-1.5 px-2">
              <SelectValue placeholder="Column" />
            </SelectTrigger>
            <SelectContent>
              {columns.map((col) => (
                <SelectItem key={col} value={col} className="text-xs">
                  {col}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filter.operator} onValueChange={(v) => updateFilter(index, 'operator', v ?? '=')}>
            <SelectTrigger className="h-7 w-20 text-xs gap-1 px-2">
              <SelectValue placeholder="Op" />
            </SelectTrigger>
            <SelectContent>
              {OPERATORS.map((op) => (
                <SelectItem key={op} value={op} className="text-xs">
                  {op}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!isNullOp(filter.operator) && (
            <Input
              value={filter.value}
              onChange={(e) => updateFilter(index, 'value', e.target.value)}
              placeholder="Value"
              className="h-7 flex-1 text-xs"
            />
          )}
          <Button variant="ghost" size="icon-xs" onClick={() => removeFilter(index)} title="Remove filter">
            <X className="size-3" />
          </Button>
        </div>
      ))}
      <Button variant="ghost" size="xs" onClick={addFilter}>
        <Plus className="size-3" />
        Add filter
      </Button>
    </div>
  );
}
