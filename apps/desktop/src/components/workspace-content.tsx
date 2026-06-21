import { lazy, Suspense } from 'react';
import type { WorkspaceTab } from '@kamehadb/shared';
import { DatabaseStats } from '@/components/database-stats';
import { MigrationAssistant } from '@/components/migration-assistant';
import { MongoQuery } from '@/components/mongo-query';
import { MongoShell } from '@/components/mongo-shell';
import { MongoView } from '@/components/mongo-view';
import { PostgresPsqlTab } from '@/components/postgres-psql-tab';
import { PostgresVectorMap } from '@/components/postgres-vector-map';
import { PostgresVectorQuery } from '@/components/postgres-vector-query';
import { QdrantQuery } from '@/components/qdrant-query';
import { QdrantView } from '@/components/qdrant-view';
import { RedisQuery } from '@/components/redis-query';
import { RedisView } from '@/components/redis-view';
import { SchemaDiffView } from '@/components/schema-diff-view';
import { SchemaGraph } from '@/components/schema-graph';
import { SchemaTimeline } from '@/components/schema-timeline';
import { SqlEditor } from '@/components/sql-editor';
import { TableStats } from '@/components/table-stats';
import { TableView } from '@/components/table-view';

const QdrantVectorMap = lazy(() =>
  import('@/components/qdrant-vector-map').then((module) => ({ default: module.QdrantVectorMap })),
);
const QdrantStatsPanel = lazy(() =>
  import('@/components/qdrant-stats').then((module) => ({ default: module.QdrantStatsPanel })),
);

export function WorkspaceContent({ activeTab }: { readonly activeTab: WorkspaceTab }) {
  if (activeTab.type === 'query') {
    return <SqlEditor key={activeTab.id} tab={activeTab} connectionId={activeTab.connectionId} />;
  }
  if (activeTab.type === 'table') {
    return <TableView connectionId={activeTab.connectionId} tableId={activeTab.title} />;
  }
  if (activeTab.type === 'graph') {
    return <SchemaGraph connectionId={activeTab.connectionId} />;
  }
  if (activeTab.type === 'mongo') {
    return <MongoView tab={activeTab} connectionId={activeTab.connectionId} />;
  }
  if (activeTab.type === 'mongo-query') {
    return <MongoQuery tab={activeTab} connectionId={activeTab.connectionId} />;
  }
  if (activeTab.type === 'mongo-shell') {
    return <MongoShell key={activeTab.id} tab={activeTab} connectionId={activeTab.connectionId} />;
  }
  if (activeTab.type === 'postgres-psql') {
    return <PostgresPsqlTab key={activeTab.id} active tab={activeTab} />;
  }
  if (activeTab.type === 'postgres-vector-search') {
    return <PostgresVectorQuery key={activeTab.id} tab={activeTab} connectionId={activeTab.connectionId} />;
  }
  if (activeTab.type === 'postgres-vector-map') {
    return <PostgresVectorMap tab={activeTab} connectionId={activeTab.connectionId} />;
  }
  if (activeTab.type === 'redis') {
    return <RedisView connectionId={activeTab.connectionId} />;
  }
  if (activeTab.type === 'redis-query') {
    return <RedisQuery tab={activeTab} connectionId={activeTab.connectionId} />;
  }
  if (activeTab.type === 'qdrant') {
    return <QdrantView connectionId={activeTab.connectionId} collection={activeTab.collection} />;
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
    return <DatabaseStats connectionId={activeTab.connectionId} />;
  }
  if (activeTab.type === 'schema-timeline') {
    return <SchemaTimeline connectionId={activeTab.connectionId} />;
  }
  if (activeTab.type === 'schema-diff') {
    return <SchemaDiffView connectionId={activeTab.connectionId} />;
  }
  if (activeTab.type === 'migration') {
    return (
      <MigrationAssistant
        connectionId={activeTab.connectionId}
        fromSnapshotId={activeTab.fromSnapshotId}
        toSnapshotId={activeTab.toSnapshotId}
      />
    );
  }
  if (activeTab.type === 'table-stats') {
    return <TableStats connectionId={activeTab.connectionId} tableId={activeTab.tableId} />;
  }
  if (activeTab.type === 'stats') {
    return <DatabaseStats connectionId={activeTab.connectionId} />;
  }
  if (activeTab.type === 'tigerbeetle') {
    return (
      <div className="h-full flex items-center justify-center text-sm text-muted-foreground">TigerBeetle explorer</div>
    );
  }
  return (
    <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
      Unsupported tab: {activeTab.type}
    </div>
  );
}
