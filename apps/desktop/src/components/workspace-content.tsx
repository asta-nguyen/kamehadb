import { lazy, Suspense } from 'react';
import type { WorkspaceTab } from '@/lib/types';
import { DatabaseStats } from '@/components/database-stats';
import { MigrationAssistant } from '@/components/migration-assistant';
import { MongoQuery } from '@/components/mongo-query';
import { MongoShell } from '@/components/mongo-shell';
import { MongoView } from '@/components/mongo-view';
import { PostgresPsqlTab } from '@/components/postgres-psql-tab';
import { PostgresVectorMap } from '@/components/postgres-vector-map';
import { VectorQuery } from '@/components/vector-query';
import { QdrantQuery } from '@/components/qdrant-query';
import { QdrantView } from '@/components/qdrant-view';
import { RedisQuery } from '@/components/redis-query';
import { RedisView } from '@/components/redis-view';
import { SchemaDiffView } from '@/components/schema-diff-view';
import { SchemaGraph } from '@/components/schema-graph';
import { SchemaTimeline } from '@/components/schema-timeline';
import { SqlEditor } from '@/components/sql-editor';
import { SqliteVecMap } from '@/components/sqlite-vec-map';
import { TableStats } from '@/components/table-stats';
import { TableView } from '@/components/table-view';
import { TigerBeetleExplorer } from '@/components/tigerbeetle-explorer';

const QdrantVectorMap = lazy(() =>
  import('@/components/qdrant-vector-map').then((module) => ({ default: module.QdrantVectorMap })),
);
const QdrantStatsPanel = lazy(() =>
  import('@/components/qdrant-stats').then((module) => ({ default: module.QdrantStatsPanel })),
);
const TigerBeetleStatsPanel = lazy(() =>
  import('@/components/tigerbeetle-stats').then((module) => ({ default: module.TigerBeetleStatsPanel })),
);
const FederatedQueryCanvas = lazy(() =>
  import('@/components/federated-query-canvas').then((module) => ({ default: module.FederatedQueryCanvas })),
);

export function WorkspaceContent({ activeTab }: { readonly activeTab: WorkspaceTab }) {
  if (activeTab.type === 'query') {
    return <SqlEditor key={activeTab.id} tab={activeTab} connectionId={activeTab.connectionId} />;
  }
  if (activeTab.type === 'table') {
    return <TableView key={activeTab.id} connectionId={activeTab.connectionId} tableId={activeTab.title} />;
  }
  if (activeTab.type === 'graph') {
    return <SchemaGraph key={activeTab.id} connectionId={activeTab.connectionId} />;
  }
  if (activeTab.type === 'mongo') {
    return <MongoView key={activeTab.id} tab={activeTab} connectionId={activeTab.connectionId} />;
  }
  if (activeTab.type === 'mongo-query') {
    return <MongoQuery key={activeTab.id} tab={activeTab} connectionId={activeTab.connectionId} />;
  }
  if (activeTab.type === 'mongo-shell') {
    return <MongoShell key={activeTab.id} tab={activeTab} connectionId={activeTab.connectionId} />;
  }
  if (activeTab.type === 'postgres-psql') {
    return <PostgresPsqlTab key={activeTab.id} active tab={activeTab} />;
  }
  if (activeTab.type === 'postgres-vector-search') {
    return <VectorQuery key={activeTab.id} tab={activeTab} connectionId={activeTab.connectionId} />;
  }
  if (activeTab.type === 'postgres-vector-map') {
    return <PostgresVectorMap key={activeTab.id} tab={activeTab} connectionId={activeTab.connectionId} />;
  }
  if (activeTab.type === 'sqlite-vec-search') {
    return <VectorQuery key={activeTab.id} tab={activeTab} connectionId={activeTab.connectionId} />;
  }
  if (activeTab.type === 'sqlite-vec-map') {
    return <SqliteVecMap key={activeTab.id} tab={activeTab} connectionId={activeTab.connectionId} />;
  }
  if (activeTab.type === 'redis') {
    return <RedisView key={activeTab.id} connectionId={activeTab.connectionId} />;
  }
  if (activeTab.type === 'redis-query') {
    return <RedisQuery key={activeTab.id} tab={activeTab} connectionId={activeTab.connectionId} />;
  }
  if (activeTab.type === 'qdrant') {
    return <QdrantView key={activeTab.id} connectionId={activeTab.connectionId} collection={activeTab.collection} />;
  }
  if (activeTab.type === 'qdrant-search') {
    return <QdrantQuery key={activeTab.id} tab={activeTab} connectionId={activeTab.connectionId} />;
  }
  if (activeTab.type === 'qdrant-graph') {
    return (
      <Suspense
        fallback={
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Loading map…</div>
        }
      >
        <QdrantVectorMap tab={activeTab} connectionId={activeTab.connectionId} collection={activeTab.collection} />
      </Suspense>
    );
  }
  if (activeTab.type === 'qdrant-stats') {
    return (
      <Suspense>
        <QdrantStatsPanel connectionId={activeTab.connectionId} collection={activeTab.collection} />
      </Suspense>
    );
  }
  if (activeTab.type === 'database-stats') {
    return <DatabaseStats key={activeTab.id} connectionId={activeTab.connectionId} />;
  }
  if (activeTab.type === 'schema-timeline') {
    return <SchemaTimeline key={activeTab.id} connectionId={activeTab.connectionId} />;
  }
  if (activeTab.type === 'schema-diff') {
    return <SchemaDiffView key={activeTab.id} connectionId={activeTab.connectionId} />;
  }
  if (activeTab.type === 'migration') {
    return (
      <MigrationAssistant
        key={activeTab.id}
        connectionId={activeTab.connectionId}
        fromSnapshotId={activeTab.fromSnapshotId}
        toSnapshotId={activeTab.toSnapshotId}
      />
    );
  }
  if (activeTab.type === 'table-stats') {
    return <TableStats key={activeTab.id} connectionId={activeTab.connectionId} tableId={activeTab.tableId} />;
  }
  if (activeTab.type === 'stats') {
    return <DatabaseStats key={activeTab.id} connectionId={activeTab.connectionId} />;
  }
  if (activeTab.type === 'tigerbeetle') {
    return <TigerBeetleExplorer key={activeTab.id} connectionId={activeTab.connectionId} />;
  }
  if (activeTab.type === 'tigerbeetle-stats') {
    return (
      <Suspense>
        <TigerBeetleStatsPanel connectionId={activeTab.connectionId} />
      </Suspense>
    );
  }
  if (activeTab.type === 'federated-query') {
    return (
      <Suspense
        fallback={<div className="h-full flex items-center justify-center text-sm text-muted-foreground">Loading…</div>}
      >
        <FederatedQueryCanvas key={activeTab.id} tab={activeTab} />
      </Suspense>
    );
  }
  return (
    <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
      Unsupported tab: {activeTab.type}
    </div>
  );
}
