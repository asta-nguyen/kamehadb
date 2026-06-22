import { CommandDialog, CommandGroup, CommandItem, CommandList, CommandShortcut } from '@/components/ui/command';
import { useEffect, useMemo, useState } from 'react';

type ShortcutEntry = {
  keys: string;
  description: string;
};

const SHORTCUT_GROUPS: { heading: string; entries: ShortcutEntry[] }[] = [
  {
    heading: 'Global',
    entries: [
      { keys: 'Ctrl+K', description: 'Open command palette / global search' },
      { keys: 'Ctrl+/', description: 'Show keyboard shortcuts' },
      { keys: 'Ctrl+,', description: 'Open API settings' },
      { keys: 'Ctrl+L', description: 'Open logs' },
    ],
  },
  {
    heading: 'Tabs',
    entries: [
      { keys: 'Ctrl+W', description: 'Close active tab' },
      { keys: 'Ctrl+Shift+W', description: 'Close all tabs' },
      { keys: 'Ctrl+Tab', description: 'Switch to next tab' },
      { keys: 'Ctrl+Shift+Tab', description: 'Switch to previous tab' },
      { keys: 'Ctrl+1 — Ctrl+9', description: 'Jump to tab by position' },
    ],
  },
  {
    heading: 'Actions',
    entries: [
      { keys: 'Ctrl+N', description: 'New query tab (requires active SQL connection)' },
      { keys: 'Ctrl+Shift+K', description: 'Open AI chat panel for active connection' },
    ],
  },
  {
    heading: 'Table Editing',
    entries: [
      { keys: 'Enter', description: 'Confirm cell edit' },
      { keys: 'Escape', description: 'Cancel cell edit' },
    ],
  },
  {
    heading: 'Column Resize',
    entries: [
      { keys: 'Drag', description: 'Drag the right edge of a column header to resize' },
      { keys: 'Enter / Space', description: 'Start resize mode on focused column header' },
    ],
  },
  {
    heading: 'Navigation',
    entries: [
      { keys: 'Enter / Space', description: 'Activate focused row or item' },
      { keys: 'Arrow Up / Down', description: 'Adjust split ratio in Monaco / Mongo editor panels' },
    ],
  },
];

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
