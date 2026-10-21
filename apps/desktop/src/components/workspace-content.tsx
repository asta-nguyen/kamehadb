import { lazy, Suspense, type ReactElement } from 'react';
import type { WorkspaceTab } from '@/lib/types';

// Defer panel libraries until their first tab opens; importing every panel at
// startup otherwise evaluates charts, graph, editors and terminals while idle.
const DatabaseStats = lazy(() => import('@/components/database-stats').then((m) => ({ default: m.DatabaseStats })));
const MigrationAssistant = lazy(() =>
  import('@/components/migration-assistant').then((m) => ({ default: m.MigrationAssistant })),
);
const MongoQuery = lazy(() => import('@/components/mongo-query').then((m) => ({ default: m.MongoQuery })));
const MongoShell = lazy(() => import('@/components/mongo-shell').then((m) => ({ default: m.MongoShell })));
const MongoView = lazy(() => import('@/components/mongo-view').then((m) => ({ default: m.MongoView })));
const PostgresPsqlTab = lazy(() =>
  import('@/components/postgres-psql-tab').then((m) => ({ default: m.PostgresPsqlTab })),
);
const RedisQuery = lazy(() => import('@/components/redis-query').then((m) => ({ default: m.RedisQuery })));
const RedisView = lazy(() => import('@/components/redis-view').then((m) => ({ default: m.RedisView })));
const SchemaDiffView = lazy(() => import('@/components/schema-diff-view').then((m) => ({ default: m.SchemaDiffView })));
const SchemaGraph = lazy(() => import('@/components/schema-graph').then((m) => ({ default: m.SchemaGraph })));
const SchemaTimeline = lazy(() => import('@/components/schema-timeline').then((m) => ({ default: m.SchemaTimeline })));
const SqlEditor = lazy(() => import('@/components/sql-editor').then((m) => ({ default: m.SqlEditor })));
const TableStats = lazy(() => import('@/components/table-stats').then((m) => ({ default: m.TableStats })));
const TableView = lazy(() => import('@/components/table-view').then((m) => ({ default: m.TableView })));

const FederatedQueryCanvas = lazy(() =>
  import('@/components/federated-query-canvas').then((module) => ({ default: module.FederatedQueryCanvas })),
);

export function WorkspaceContent({
  activeTab,
  isActive = true,
}: {
  readonly activeTab: WorkspaceTab;
  readonly isActive?: boolean;
}): ReactElement {
  return (
    <Suspense
      fallback={<div className="h-full flex items-center justify-center text-sm text-muted-foreground">Loading…</div>}
    >
      <WorkspacePanel activeTab={activeTab} isActive={isActive} />
    </Suspense>
  );
}

function WorkspacePanel({
  activeTab,
  isActive = true,
}: {
  readonly activeTab: WorkspaceTab;
  readonly isActive?: boolean;
}): ReactElement {
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
    return <PostgresPsqlTab key={activeTab.id} active={isActive} tab={activeTab} />;
  }
  if (activeTab.type === 'redis') {
    return <RedisView key={activeTab.id} connectionId={activeTab.connectionId} />;
  }
  if (activeTab.type === 'redis-query') {
    return <RedisQuery key={activeTab.id} tab={activeTab} connectionId={activeTab.connectionId} />;
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
  if (activeTab.type === 'federated-query') {
    return <FederatedQueryCanvas key={activeTab.id} tab={activeTab} />;
  }
  return (
    <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
      Unsupported tab: {activeTab.type}
    </div>
  );
}
