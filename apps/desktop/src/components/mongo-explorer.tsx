import { useState, useEffect, useMemo, useCallback } from 'react';
import { useStore } from '@tanstack/react-store';
import { useMongoDatabases, useMongoCollections } from '@/hooks/use-mongo';
import { Database, Table2, Eye, Clock, Loader2, Search, Sparkles } from 'lucide-react';
import { openMongoTab, setActiveMongoDatabase, openAiChatPanel, appStore } from '@/store';
import type { CollectionInfo } from '@kamehadb/shared';

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
  const storedDb = useStore(appStore, (s) => s.activeMongoDatabase);
  const [selectedDb, setSelectedDb] = useState<string | null>(storedDb);
  const [expandedDbs, setExpandedDbs] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const { data: databases, isLoading: loadingDatabases } = useMongoDatabases(connectionId);

  // Auto-select and auto-expand first database
  useEffect(() => {
    if (!selectedDb && databases?.length) {
      const first = databases[0].name;
      setSelectedDb(first);
      setExpandedDbs(new Set([first]));
      setActiveMongoDatabase(first);
    }
  }, [databases, selectedDb]);

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
    setSelectedCollection(null);
  };

  return (
    <div className="space-y-1">
      <div className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center justify-between">
        <span>Databases</span>
        <span className="normal-case font-normal">{databases?.length ?? 0}</span>
      </div>
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
            selectedCollection={selectedCollection}
            onSelectCollection={setSelectedCollection}
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
  selectedCollection: string | null;
  onSelectCollection: (name: string | null) => void;
}

function DatabaseNode({
  dbName,
  connectionId,
  expanded,
  onToggle,
  onSelect,
  searchQuery,
  onSearchChange,
  selectedCollection,
  onSelectCollection,
}: DatabaseNodeProps) {
  const { data: collections, isLoading: loadingCollections } = useMongoCollections(
    connectionId,
    expanded ? dbName : null,
  );

  const filteredCollections = useMemo(() => {
    if (!collections) return [];
    if (!searchQuery.trim()) return collections;
    const query = searchQuery.toLowerCase();
    return collections.filter((col) => col.name.toLowerCase().includes(query));
  }, [collections, searchQuery]);

  const handleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggle();
    onSelect();
  };

  const handleCollectionClick = useCallback(
    (collection: CollectionInfo) => {
      onSelectCollection(`${dbName}:${collection.name}`);
      openMongoTab(connectionId, dbName, collection.name);
    },
    [connectionId, dbName, onSelectCollection],
  );

  return (
    <div>
      <button
        onClick={handleExpand}
        className="w-full flex items-center gap-1.5 px-2 py-1 text-xs hover:bg-muted rounded-md transition-colors"
      >
        <Database className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate" title={dbName}>
          {dbName}
        </span>
        {collections && <span className="ml-auto text-xs text-muted-foreground">{collections.length}</span>}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
            openAiChatPanel(connectionId);
          }}
          className="p-1 rounded hover:bg-primary/10 text-muted-foreground/60 hover:text-primary transition-colors"
          title="Start AI Chat"
        >
          <Sparkles className="size-3" />
        </button>
        {expanded ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-3 shrink-0 text-muted-foreground/60"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-3 shrink-0 text-muted-foreground/60"
          >
            <path d="m9 18 6-6-6-6" />
          </svg>
        )}
      </button>
      {expanded && (
        <div className="ml-4 pl-2 border-l border-border">
          <div className="px-2 py-1">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Filter..."
                className="w-full h-6 pl-6 pr-2 text-xs bg-background border rounded focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
            </div>
          </div>

          {loadingCollections ? (
            <div className="flex items-center justify-center py-2">
              <Loader2 className="size-3 animate-spin text-muted-foreground" />
            </div>
          ) : filteredCollections.length === 0 ? (
            <div className="px-2 py-1 text-xs text-muted-foreground italic">
              {collections?.length === 0 ? 'No collections' : 'No matches'}
            </div>
          ) : (
            filteredCollections.map((col) => {
              const Icon = typeIcons[col.type];
              return (
                <button
                  key={col.name}
                  onClick={() => handleCollectionClick(col)}
                  className={`w-full flex items-center gap-1.5 px-2 py-1 text-xs hover:bg-muted rounded-md transition-colors ${selectedCollection === `${dbName}:${col.name}` ? 'bg-muted/50' : ''}`}
                >
                  <Icon className={`size-3 shrink-0 ${typeColors[col.type]}`} />
                  <span className="truncate" title={col.name}>
                    {col.name}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
