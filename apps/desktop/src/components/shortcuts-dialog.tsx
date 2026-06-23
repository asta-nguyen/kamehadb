import { CommandDialog, CommandGroup, CommandItem, CommandList, CommandShortcut } from '@/components/ui/command';
import { useEffect, useMemo, useState } from 'react';
import { SHORTCUT_GROUPS } from '@/lib/constants';

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const filtered = useMemo(() => {
    if (!query.trim()) return SHORTCUT_GROUPS;
    const q = query.toLowerCase();
    return SHORTCUT_GROUPS.map((group) => ({
      ...group,
      entries: group.entries.filter((e) => e.keys.toLowerCase().includes(q) || e.description.toLowerCase().includes(q)),
    })).filter((g) => g.entries.length > 0);
  }, [query]);

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Keyboard Shortcuts"
      description="Search available shortcuts..."
    >
      <div className="p-1 pb-0">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search shortcuts..."
          className="w-full h-8 rounded-lg border border-input/30 bg-input/30 px-3 text-sm outline-none focus:ring-1 focus:ring-primary/40"
          autoFocus
        />
      </div>
      <CommandList>
        {filtered.map((group) => (
          <CommandGroup key={group.heading} heading={group.heading}>
            {group.entries.map((entry) => (
              <CommandItem key={`${group.heading}-${entry.keys}`} value={`${entry.keys} ${entry.description}`}>
                <span className="flex-1 truncate text-sm" title={entry.description}>
                  {entry.description}
                </span>
                <CommandShortcut className="shrink-0 whitespace-nowrap rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                  {entry.keys}
                </CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
