import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command';
import { useConnections } from '@/hooks/use-connections';
import {
  appStore,
  openAiChatPanel,
  openDatabaseStatsTab,
  openGraphTab,
  openNewQueryTab,
  setActiveConnection,
} from '@/store';
import { getApiBase } from '@/lib/api';
import { DbIcon } from '@/components/db-icon';
import { useStore } from '@tanstack/react-store';
import { BarChart3, Database, FileText, Share2, Sparkles, Table2, Terminal } from 'lucide-react';
import type { DbKind, SchemaSearchMatch } from '@kamehadb/shared';

const SQL_KINDS: DbKind[] = ['postgres', 'mysql', 'sqlite', 'sqlserver', 'oracle', 'clickhouse', 'mariadb', 'duckdb'];
const isSql = (k: string | undefined) => k && SQL_KINDS.includes(k as DbKind);

export function GlobalSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [query, setQuery] = useState('');
  const [schemaResults, setSchemaResults] = useState<Map<string, SchemaSearchMatch[]>>(new Map());
  const [unsupportedConns, setUnsupportedConns] = useState<Set<string>>(new Set());
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const { data: connections } = useConnections();
  const openedTabs = useStore(appStore, (state) => state.openedTabs);
  const activeConnectionId = useStore(appStore, (state) => state.activeConnectionId);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setQuery('');
      setSchemaResults(new Map());
      setUnsupportedConns(new Set());
      setSearching(false);
    }
  }, [open]);

  // Debounced schema search across all SQL connections
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();

    if (!query || query.length < 2 || !connections) {
      setSchemaResults(new Map());
      setSearching(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      const abort = new AbortController();
      abortRef.current = abort;

      const sqlConns = connections.filter((c) => isSql(c.kind));
      const results = new Map<string, SchemaSearchMatch[]>();

      const unsupported = new Set<string>();

      await Promise.all(
        sqlConns.map(async (conn) => {
          try {
            const url = `${getApiBase()}/sql/${conn.id}/search-schema?q=${encodeURIComponent(query)}&limit=5`;
            const res = await fetch(url, { signal: abort.signal });
            if (res.ok) {
              const data: SchemaSearchMatch[] = await res.json();
              if (data.length > 0) results.set(conn.id, data);
            } else if (res.status === 400) {
              const body = await res.json().catch(() => ({}));
              if (body.error === 'NOT_SUPPORTED') unsupported.add(conn.id);
            }
          } catch {
            // Aborted or failed — skip silently
          }
        }),
      );

      if (!abort.signal.aborted) {
        setSchemaResults(results);
        setUnsupportedConns(unsupported);
        setSearching(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, connections]);

  const activeConn = useMemo(
    () => connections?.find((c) => c.id === activeConnectionId),
    [connections, activeConnectionId],
  );

  const select = useCallback(
    (fn: () => void) => {
      fn();
      onOpenChange(false);
    },
    [onOpenChange],
  );

  // Group schema results by connection name for rendering
  const schemaGroups = useMemo(() => {
    if (schemaResults.size === 0) return [];
    return Array.from(schemaResults.entries()).map(([connId, matches]) => {
      const conn = connections?.find((c) => c.id === connId);
      return { connId, connName: conn?.name ?? connId, matches };
    });
  }, [schemaResults, connections]);

  const hasResults =
    (activeConn && isSql(activeConn.kind)) ||
    activeConn ||
    (connections && connections.length > 0) ||
    schemaResults.size > 0 ||
    openedTabs.length > 0;

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search connections, tables, actions…" value={query} onValueChange={setQuery} />
      <CommandList>
        {searching && (
          <div className="flex items-center justify-center py-4">
            <div className="size-4 animate-spin rounded-full border-2 border-muted-foreground/20 border-t-muted-foreground/60" />
          </div>
        )}
        {!searching && query && query.length >= 2 && !hasResults && <CommandEmpty>No results found</CommandEmpty>}

        {/* Actions */}
        {(activeConn && isSql(activeConn.kind)) || activeConn ? (
          <CommandGroup heading="Actions">
            {activeConn && isSql(activeConn.kind) && (
              <>
                <CommandItem
                  value={`new-query-${activeConn.name}`}
                  onSelect={() => select(() => openNewQueryTab(activeConnectionId!))}
                >
                  <FileText className="size-4" />
                  <span>New Query</span>
                  <CommandShortcut>in {activeConn.name}</CommandShortcut>
                </CommandItem>
                <CommandItem
                  value={`graph-${activeConn.name}`}
                  onSelect={() => select(() => openGraphTab(activeConnectionId!))}
                >
                  <Share2 className="size-4" />
                  <span>Schema Graph</span>
                  <CommandShortcut>in {activeConn.name}</CommandShortcut>
                </CommandItem>
                <CommandItem
                  value={`stats-${activeConn.name}`}
                  onSelect={() => select(() => openDatabaseStatsTab(activeConnectionId!))}
                >
                  <BarChart3 className="size-4" />
                  <span>Database Stats</span>
                  <CommandShortcut>in {activeConn.name}</CommandShortcut>
                </CommandItem>
              </>
            )}
            <CommandItem
              value={`ai-chat-${activeConn?.name ?? ''}`}
              onSelect={() => select(() => openAiChatPanel(activeConnectionId!))}
            >
              <Sparkles className="size-4" />
              <span>AI Chat</span>
              {activeConn && <CommandShortcut>with {activeConn.name}</CommandShortcut>}
            </CommandItem>
          </CommandGroup>
        ) : null}

        {/* Connections */}
        {connections && connections.length > 0 && (
          <CommandGroup heading="Connections">
            {connections.map((conn) => (
              <CommandItem
                key={conn.id}
                value={`${conn.name} ${conn.kind} ${conn.id}`}
                onSelect={() =>
                  select(() => {
                    setActiveConnection(conn.id);
                    appStore.setState((s) => ({
                      ...s,
                      view: 'workspace',
                      expandedConnections: [...s.expandedConnections.filter((id) => id !== conn.id), conn.id],
                    }));
                  })
                }
              >
                <DbIcon kind={conn.kind} className="size-4" />
                <span>{conn.name}</span>
                <CommandShortcut>{conn.kind}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Schema results — one group per connection */}
        {schemaGroups.map(({ connId, connName, matches }) => (
          <CommandGroup key={connId} heading={`${connName} — Tables`}>
            {matches.map((match) => {
              const title = match.column
                ? `${match.table}.${match.column}`
                : match.schema
                  ? `${match.schema}.${match.table}`
                  : match.table;
              return (
                <CommandItem
                  key={`schema-${connId}-${match.table}${match.column ? '-' + match.column : ''}`}
                  value={`${title} ${match.table} ${match.column ?? ''} ${connName} ${connId}`}
                  onSelect={() =>
                    select(() => {
                      setActiveConnection(connId);
                      const tabId = `${connId}:${match.table}`;
                      const existingTab = appStore.state.openedTabs.find((t) => t.id === tabId);
                      if (existingTab) {
                        appStore.setState((s) => ({ ...s, view: 'workspace', activeTabId: tabId }));
                      } else {
                        appStore.setState((s) => ({
                          ...s,
                          view: 'workspace',
                          openedTabs: [
                            ...s.openedTabs,
                            { id: tabId, type: 'table' as const, title: match.table, connectionId: connId },
                          ],
                          activeTabId: tabId,
                        }));
                      }
                    })
                  }
                >
                  {match.column ? <Table2 className="size-4" /> : <Database className="size-4" />}
                  <span>{title}</span>
                  <CommandShortcut>{match.matchType === 'table' ? 'Table' : 'Column'}</CommandShortcut>
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}

        {/* Schema search not supported for some connections */}
        {unsupportedConns.size > 0 && (
          <CommandGroup heading="Table search unavailable">
            {Array.from(unsupportedConns).map((connId) => {
              const conn = connections?.find((c) => c.id === connId);
              return (
                <div key={connId} className="px-2 py-1.5 text-xs text-muted-foreground flex items-center gap-2">
                  <DbIcon kind={conn?.kind ?? 'postgres'} className="size-3.5" />
                  <span>
                    <span className="font-medium">{conn?.name ?? connId}</span> — schema search not available for this
                    database type
                  </span>
                </div>
              );
            })}
          </CommandGroup>
        )}

        {/* Open Tabs */}
        {openedTabs.length > 0 && (
          <CommandGroup heading="Open Tabs">
            {openedTabs.map((tab) => {
              let icon = <Terminal className="size-4" />;
              if (tab.type === 'query') icon = <FileText className="size-4" />;
              else if (tab.type === 'graph') icon = <Share2 className="size-4" />;
              else if (tab.type === 'table') icon = <Table2 className="size-4" />;
              return (
                <CommandItem
                  key={tab.id}
                  value={`tab ${tab.title} ${tab.id}`}
                  onSelect={() =>
                    select(() => {
                      appStore.setState((s) => ({ ...s, view: 'workspace', activeTabId: tab.id }));
                    })
                  }
                >
                  {icon}
                  <span>{tab.title}</span>
                  <CommandShortcut>{tab.type.replace(/-/g, ' ')}</CommandShortcut>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
