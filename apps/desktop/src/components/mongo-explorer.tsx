import { useState, useEffect, useMemo } from 'react';
import { useStore } from '@tanstack/react-store';
import { useMongoDatabases, useMongoCollections } from '@/hooks/use-mongo';
import { ChevronRight, ChevronDown, Database, Table2, Eye, Clock, Loader2, Search } from 'lucide-react';
import { openMongoTab, setActiveMongoDatabase, appStore } from '@/store';
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
  const [searchQuery, setSearchQuery] = useState('');
  const { data: databases, isLoading: loadingDatabases } = useMongoDatabases(connectionId);

  // Auto-select first database if none selected
  useEffect(() => {
    if (!selectedDb && databases?.length) {
      setSelectedDb(databases[0].name);
      setActiveMongoDatabase(databases[0].name);
    }
  }, [databases, selectedDb]);

  const handleDbSelect = (dbName: string) => {
    setSelectedDb(dbName);
    setActiveMongoDatabase(dbName);
    setSearchQuery('');
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
            isSelected={selectedDb === db.name}
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
  isSelected: boolean;
  onSelect: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

function DatabaseNode({ dbName, connectionId, isSelected, onSelect, searchQuery, onSearchChange }: DatabaseNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const { data: collections, isLoading: loadingCollections } = useMongoCollections(
    connectionId,
    isSelected ? dbName : null,
  );

  const filteredCollections = useMemo(() => {
    if (!collections) return [];
    if (!searchQuery.trim()) return collections;
    const query = searchQuery.toLowerCase();
    return collections.filter((col) => col.name.toLowerCase().includes(query));
  }, [collections, searchQuery]);

  const handleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(!expanded);
    if (!expanded) onSelect();
  };

  const handleCollectionClick = (collection: CollectionInfo) => {
    openMongoTab(connectionId, dbName, collection.name);
  };

  return (
    <div>
      <button
        onClick={handleExpand}
        className="w-full flex items-center gap-1.5 px-2 py-1 text-xs hover:bg-muted rounded-md transition-colors"
      >
        {expanded ? <ChevronDown className="size-3 shrink-0" /> : <ChevronRight className="size-3 shrink-0" />}
        <Database className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{dbName}</span>
        {isSelected && collections && (
          <span className="ml-auto text-xs text-muted-foreground">{collections.length}</span>
        )}
      </button>
      {expanded && isSelected && (
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
                  className="w-full flex items-center gap-1.5 px-2 py-1 text-xs hover:bg-muted rounded-md transition-colors group"
                  title={`${col.type}${col.documentCount !== undefined ? ` (${col.documentCount} docs)` : ''}`}
                >
                  <Icon className={`size-3 shrink-0 ${typeColors[col.type]}`} />
                  <span className="truncate flex-1">{col.name}</span>
                  <span className="text-xs text-muted-foreground uppercase ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                    {col.type}
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
