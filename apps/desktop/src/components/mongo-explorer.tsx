import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useMongoCollections, useMongoDatabases } from '@/hooks/use-mongo';
import { fuzzyMatch } from '@/lib/utils';
import { appStore, setActiveMongoDatabase } from '@/store';
import { useStore } from '@tanstack/react-store';
import type { CollectionInfo } from '@kamehadb/shared';
import { ChevronDown, ChevronRight, Clock, Database, Eye, Search, Table2 } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { nanoid } from 'nanoid';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
  const selectedDbRef = useRef<string | null>(null);
  const [expandedDbs, setExpandedDbs] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const { data: databases, isLoading: loadingDatabases } = useMongoDatabases(connectionId);

  // Auto-select and auto-expand the first database once it loads
  const firstDb = databases?.[0]?.name;
  useEffect(() => {
    if (firstDb && !selectedDbRef.current) {
      selectedDbRef.current = firstDb;
      setExpandedDbs((prev) => new Set([...prev, firstDb]));
      setActiveMongoDatabase(firstDb);
    }
  }, [firstDb]);

  const toggleDb = (name: string) => {
    setExpandedDbs((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleDbSelect = (dbName: string) => {
    selectedDbRef.current = dbName;
    setActiveMongoDatabase(dbName);
    setSearchQuery('');
  };

  return (
    <div className="space-y-0.5">
      {loadingDatabases ? (
        <div className="flex items-center justify-center py-4">
          <Spinner size="md" />
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

  // Track the active tab so the sidebar can highlight the current collection
  const activeTab = useStore(appStore, (s) => s.openedTabs.find((t) => t.id === s.activeTabId));

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
          className="flex-1 justify-start px-2 min-w-0 font-normal"
        >
          {expanded ? (
            <ChevronDown className="text-muted-foreground/60 shrink-0 size-3" />
          ) : (
            <ChevronRight className="text-muted-foreground/60 shrink-0 size-3" />
          )}
          <Database className="text-muted-foreground/60 shrink-0 size-3.5" />
          <span className="text-foreground/80 font-medium truncate" title={dbName}>
            {dbName}
          </span>
          {expanded && collections && (
            <span className="ml-auto text-muted-foreground/50 text-xs tabular-nums">{collections.length}</span>
          )}
        </Button>
      </div>
      {expanded && (
        <div className="pl-2 ml-3 mt-0.5 border-border/60 border-l">
          <div className="px-2 py-1">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground pointer-events-none" />
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Filter..."
                className="pl-7 pr-2 h-7 text-xs"
              />
            </div>
          </div>

          {loadingCollections ? (
            <div className="flex justify-center py-2">
              <Spinner size="sm" className="text-muted-foreground/60 size-3" />
            </div>
          ) : filteredCollections.length === 0 ? (
            <p className="pl-2 py-1 text-muted-foreground/60 text-xs italic">
              {collections?.length === 0 ? 'No collections' : 'No matches'}
            </p>
          ) : (
            filteredCollections.map((col) => {
              const Icon = typeIcons[col.type];
              const isActive =
                activeTab?.type === 'mongo' &&
                activeTab?.connectionId === connectionId &&
                activeTab?.database === dbName &&
                activeTab?.collection === col.name;
              return (
                <Button
                  key={col.name}
                  variant="ghost"
                  size="sm"
                  onClick={() => handleCollectionClick(col)}
                  className={`justify-start px-2 w-full font-normal ${isActive ? 'bg-muted/50' : ''}`}
                >
                  <Icon className={`size-3 ${typeColors[col.type]} shrink-0`} />
                  <span
                    className={`truncate ${isActive ? 'text-foreground font-medium' : 'text-foreground/80'}`}
                    title={col.name}
                  >
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
