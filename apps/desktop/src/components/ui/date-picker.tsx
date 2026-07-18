import { useState } from 'react';
import { CalendarIcon } from 'lucide-react';
import { cn } from 'cnfast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { parse, format, isValid } from 'date-fns';

type DatePickerProps = {
  value: string;
  onChange: (value: string) => void;
  /** 'date' for YYYY-MM-DD, 'datetime-local' for YYYY-MM-DDTHH:mm */
  mode?: 'date' | 'datetime';
  className?: string;
};

export function DatePicker({ value, onChange, mode = 'date', className }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const dateFormat = mode === 'datetime' ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd';

  // Parse the current string value into a Date for the calendar's selected day.
  const parsed = (() => {
    if (!value) return undefined;
    // Strip timezone for date-only display
    const cleaned = value.includes('T') ? value.replace('T', ' ').slice(0, mode === 'datetime' ? 16 : 10) : value;
    const d = parse(cleaned, dateFormat, new Date());
    return isValid(d) ? d : undefined;
  })();

  const handleSelect = (date: Date | undefined) => {
    if (!date) return;
    if (mode === 'datetime') {
      // Always emit a full datetime value (YYYY-MM-DDTHH:mm). Fall back to
      // 00:00 when the existing time is absent or invalid so we never emit a
      // date-only value in datetime mode.
      let timePart = '00:00';
      if (value && value.includes('T')) {
        const candidate = value.split('T')[1]?.slice(0, 5) ?? '';
        if (/^\d{2}:\d{2}$/.test(candidate)) timePart = candidate;
      }
      onChange(`${format(date, 'yyyy-MM-dd')}T${timePart}`);
    } else {
      onChange(format(date, 'yyyy-MM-dd'));
    }
    setOpen(false);
  };

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <Input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 text-xs font-mono flex-1"
        placeholder={mode === 'datetime' ? 'YYYY-MM-DDTHH:mm' : 'YYYY-MM-DD'}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={<Button variant="ghost" size="icon-sm" className="h-8 w-8 shrink-0" title="Pick date" />}
        >
          <CalendarIcon className="size-3.5" />
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto p-0">
          <Calendar mode="single" selected={parsed} onSelect={handleSelect} autoFocus />
        </PopoverContent>
      </Popover>
    </div>
  );
}
