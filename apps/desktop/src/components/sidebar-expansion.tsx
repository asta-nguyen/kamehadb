import type { ConnectionProfile } from '@kamehadb/shared';
import { appStore } from '@/store';
import { MongoExplorer } from './mongo-explorer';
import { QdrantExplorer } from './qdrant-explorer';
import { TigerBeetleExplorer } from './tigerbeetle-explorer';
import { SchemaTree } from './schema-tree';

export function ConnectionExpansion({ conn, activeTabId }: { conn: ConnectionProfile; activeTabId: string | null }) {
  if (conn.kind === 'mongodb') return <MongoExplorer key={conn.id} connectionId={conn.id} />;
  if (conn.kind === 'qdrant') return <QdrantExplorer key={conn.id} connectionId={conn.id} />;
  if (conn.kind === 'tigerbeetle') return <TigerBeetleExplorer key={conn.id} connectionId={conn.id} />;

  return (
    <SchemaTree
      key={conn.id}
      connectionId={conn.id}
      activeTableId={activeTabId}
      onSelectTable={(tableId) => {
        const tabId = `${conn.id}:${tableId}`;
        const newTab = { id: tabId, type: 'table' as const, title: tableId, connectionId: conn.id };
        const exists = appStore.state.openedTabs.some((t) => t.id === tabId);
        appStore.setState((s) => ({
          ...s,
          view: 'workspace',
          activeTabId: tabId,
          openedTabs: exists ? s.openedTabs : [...s.openedTabs, newTab],
        }));
      }}
    />
  );
}
