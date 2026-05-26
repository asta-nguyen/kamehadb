import { useState } from 'react';
import { useMongoDatabases, useMongoCollections } from '@/hooks/use-mongo';
import { ChevronRight, ChevronDown, Database, Table2, Eye, Clock, Loader2 } from 'lucide-react';
import { openMongoTab, setActiveMongoDatabase } from '@/store';
import type { CollectionInfo } from '@kamehadb/shared';

const typeIcons: Record<CollectionInfo['type'], React.ComponentType<{ className?: string }>> = {
  collection: Table2,
  view: Eye,
  timeseries: Clock,
};

const typeColors: Record<CollectionInfo['type'], string> = {
  collection: 'text-muted-foreground',
  view: 'text-purple-500',
  timeseries: 'text-amber-500',
};

interface MongoExplorerProps {
  connectionId: string;
}

export function MongoExplorer({ connectionId }: MongoExplorerProps) {
  const [selectedDb, setSelectedDb] = useState<string | null>(null);
  const { data: databases, isLoading: loadingDatabases } = useMongoDatabases(connectionId);

  const handleDbSelect = (dbName: string) => {
    setSelectedDb(dbName);
    setActiveMongoDatabase(dbName);
  };

  return (
    <div className="space-y-0.5">
      <div className="px-2 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Databases</div>
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
}

function DatabaseNode({ dbName, connectionId, isSelected, onSelect }: DatabaseNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const { data: collections, isLoading: loadingCollections } = useMongoCollections(
    connectionId,
    isSelected ? dbName : null,
  );

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
      </button>
      {expanded && isSelected && (
        <div className="ml-4 pl-2 border-l border-border">
          {loadingCollections ? (
            <div className="flex items-center justify-center py-2">
              <Loader2 className="size-3 animate-spin text-muted-foreground" />
            </div>
          ) : (
            collections?.map((col: CollectionInfo) => {
              const Icon = typeIcons[col.type];
              return (
                <button
                  key={col.name}
                  onClick={() => handleCollectionClick(col)}
                  className="w-full flex items-center gap-1.5 px-2 py-1 text-xs hover:bg-muted rounded-md transition-colors"
                  title={`${col.type}${col.documentCount !== undefined ? ` (${col.documentCount} docs)` : ''}`}
                >
                  <Icon className={`size-3 shrink-0 ${typeColors[col.type]}`} />
                  <span className="truncate">{col.name}</span>
                  <span className="ml-auto text-[9px] text-muted-foreground uppercase">{col.type}</span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
