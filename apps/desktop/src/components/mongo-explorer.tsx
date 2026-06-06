import { useMongoCollections, useMongoDatabases } from '@/hooks/use-mongo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { appStore, openAiChatPanel, setActiveMongoDatabase } from '@/store';
import { fuzzyMatch } from '@/lib/utils';
import type { CollectionInfo } from '@kamehadb/shared';
import { ChevronDown, ChevronRight, Clock, Database, Eye, Loader2, Search, Sparkles, Table2 } from 'lucide-react';
import { nanoid } from 'nanoid';
import { useCallback, useEffect, useMemo, useState } from 'react';

const typeIcons: Record<CollectionInfo['type'], React.ComponentType<{ className?: string }>> = {
  collection: Table2,
  view: Eye,
  timeseries: Clock,
};

const typeColors: Record<CollectionInfo['type'], string> = {
  collection: 'text-muted-foreground',
  view: 'text-primary',
  timeseries: 'text-muted-foreground',
};

interface MongoExplorerProps {
  connectionId: string;
}

export function MongoExplorer({ connectionId }: MongoExplorerProps) {
  const [selectedDb, setSelectedDb] = useState<string | null>(null);
  const [expandedDbs, setExpandedDbs] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const { data: databases, isLoading: loadingDatabases } = useMongoDatabases(connectionId);

  // Reset state when switching connections
  useEffect(() => {
    setSelectedDb(null);
    setExpandedDbs(new Set());
    setSearchQuery('');
  }, [connectionId]);

  // Auto-select and auto-expand first database when it loads
  useEffect(() => {
    if (databases?.length && !selectedDb) {
      const first = databases[0].name;
      setSelectedDb(first);
      setExpandedDbs(new Set([first]));
      setActiveMongoDatabase(first);
    }
  }, [connectionId, databases, selectedDb]);

  const toggleDb = (name: string) => {
    setExpandedDbs((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleDbSelect = (dbName: string) => {
    setSelectedDb(dbName);
    setActiveMongoDatabase(dbName);
    setSearchQuery('');
  };

  return (
    <div className="space-y-0.5">
      {loadingDatabases ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </div>
      ) : (
        databases?.map((db: { name: string }) => (
          <DatabaseNode
            key={db.name}
            dbName={db.name}
            connectionId={connectionId}
            expanded={expandedDbs.has(db.name)}
            onToggle={() => toggleDb(db.name)}
            onSelect={() => handleDbSelect(db.name)}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
          />
        ))
      )}
    </div>
  );
}

interface DatabaseNodeProps {
  dbName: string;
  connectionId: string;
  expanded: boolean;
  onToggle: () => void;
  onSelect: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

function DatabaseNode({
  dbName,
  connectionId,
  expanded,
  onToggle,
  onSelect,
  searchQuery,
  onSearchChange,
}: DatabaseNodeProps) {
  const { data: collections, isLoading: loadingCollections } = useMongoCollections(
    connectionId,
    expanded ? dbName : null,
  );

  const filteredCollections = useMemo(() => {
    if (!collections) return [];
    if (!searchQuery.trim()) return collections;
    return collections.filter((col) => fuzzyMatch(searchQuery, col.name));
  }, [collections, searchQuery]);

  const handleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggle();
    onSelect();
  };

  const handleCollectionClick = useCallback(
    (collection: CollectionInfo) => {
      const newTab = {
        id: `mongo-${nanoid()}`,
        type: 'mongo' as const,
        title: collection.name,
        connectionId,
        database: dbName,
        collection: collection.name,
      };
      const existingTab = appStore.state.openedTabs.find(
        (t) =>
          t.type === 'mongo' &&
          t.connectionId === connectionId &&
          t.database === dbName &&
          t.collection === collection.name,
      );
      if (existingTab) {
        appStore.setState((s) => ({ ...s, view: 'workspace', activeTabId: existingTab.id }));
      } else {
        appStore.setState((s) => ({
          ...s,
          view: 'workspace',
          openedTabs: [...s.openedTabs, newTab],
          activeTabId: newTab.id,
        }));
      }
    },
    [connectionId, dbName],
  );

  return (
    <div className="select-none">
      <div className="flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleExpand}
          className="flex-1 justify-start font-normal px-2 min-w-0"
        >
          {expanded ? (
            <ChevronDown className="size-3 text-muted-foreground/60 shrink-0" />
          ) : (
            <ChevronRight className="size-3 text-muted-foreground/60 shrink-0" />
          )}
          <Database className="size-3.5 text-muted-foreground/60 shrink-0" />
          <span className="font-medium text-foreground/80 truncate" title={dbName}>
            {dbName}
          </span>
          {expanded && collections && (
            <span className="ml-auto text-xs text-muted-foreground/50 tabular-nums">{collections.length}</span>
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
            openAiChatPanel(connectionId);
          }}
          className="size-6 shrink-0"
          title="AI Chat"
        >
          <Sparkles className="size-3 text-muted-foreground/60" />
        </Button>
      </div>
      {expanded && (
        <div className="mt-0.5 ml-3 pl-2 border-l border-border/60">
          <div className="px-2 py-1">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground pointer-events-none" />
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Filter..."
                className="h-6 pl-6 pr-2 text-xs"
              />
            </div>
          </div>

          {loadingCollections ? (
            <div className="flex justify-center py-2">
              <Loader2 className="size-3 animate-spin text-muted-foreground/60" />
            </div>
          ) : filteredCollections.length === 0 ? (
            <p className="text-xs text-muted-foreground/60 pl-2 py-1 italic">
              {collections?.length === 0 ? 'No collections' : 'No matches'}
            </p>
          ) : (
            filteredCollections.map((col) => {
              const Icon = typeIcons[col.type];
              return (
                <Button
                  key={col.name}
                  variant="ghost"
                  size="sm"
                  onClick={() => handleCollectionClick(col)}
                  className="w-full justify-start font-normal px-2"
                >
                  <Icon className={`size-3 ${typeColors[col.type]} shrink-0`} />
                  <span className="truncate text-foreground/80" title={col.name}>
                    {col.name}
                  </span>
                </Button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
