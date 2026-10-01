import { useConnections } from '@/hooks/use-connections';
import { DbIcon } from '@/components/db-icon';
import { getIndicatorColor } from '@/components/sidebar.helpers';
import {
  appStore,
  closeAllTabs,
  closeOtherTabs,
  closeTab,
  closeTabsToRight,
  duplicateTab,
  openFederatedQueryTab,
  openGraphTab,
  openMongoQueryTab,
  openNewQueryTab,
  openRedisQueryTab,
  renameTab,
  reorderTabs,
  toggleTabPin,
} from '@/store';
import { isSqlKind } from '@/lib/constants';
import type { WorkspaceTab } from '@/lib/types';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useStore } from '@tanstack/react-store';
import {
  Activity,
  BarChart3,
  Box,
  Copy,
  Database,
  GitCompare,
  History,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Share2,
  Table2,
  Terminal,
  X,
} from 'lucide-react';
import { useRef, useState } from 'react';

function tabIcon(tabType: string) {
  if (tabType === 'query' || tabType === 'redis-query' || tabType === 'migration')
    return <Terminal className="size-3" />;
  if (
    tabType === 'graph' ||
    tabType === 'qdrant-graph' ||
    tabType === 'postgres-vector-map' ||
    tabType === 'sqlite-vec-map'
  )
    return <Share2 className="size-3" />;
  if (tabType === 'mongo' || tabType === 'mongo-query') return <Table2 className="size-3" />;
  if (tabType === 'redis') return <Box className="size-3" />;
  if (tabType === 'qdrant') return <DbIcon kind="qdrant" className="size-3" />;
  if (tabType === 'tigerbeetle') return <DbIcon kind="tigerbeetle" className="size-3" />;
  if (tabType === 'qdrant-search' || tabType === 'postgres-vector-search' || tabType === 'sqlite-vec-search')
    return <Search className="size-3" />;
  if (
    tabType === 'qdrant-stats' ||
    tabType === 'stats' ||
    tabType === 'database-stats' ||
    tabType === 'tigerbeetle-stats'
  )
    return <BarChart3 className="size-3" />;
  if (tabType === 'table-stats') return <Activity className="size-3" />;
  if (tabType === 'schema-timeline' || tabType === 'schema-diff') return <History className="size-3" />;
  if (tabType === 'federated-query') return <GitCompare className="size-3" />;
  return <Table2 className="size-3" />;
}

export function WorkspaceTabBar() {
  const openedTabs = useStore(appStore, (state) => state.openedTabs);
  const activeTabId = useStore(appStore, (state) => state.activeTabId);
  const activeConnectionId = useStore(appStore, (state) => state.activeConnectionId);
  const connectionStatus = useStore(appStore, (state) => state.connectionStatus);
  const { data: connections } = useConnections();
  const activeConnection = connections?.find((connection) => connection.id === activeConnectionId);
  const activeTab = openedTabs.find((tab) => tab.id === activeTabId);

  const dragIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [tabToRename, setTabToRename] = useState<WorkspaceTab | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Commit a non-empty trimmed title, then close the dialog without changing tab state.
  function handleRenameSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tabToRename || !renameValue.trim()) return;
    renameTab(tabToRename.id, renameValue);
    setTabToRename(null);
    setRenameValue('');
  }

  return (
    <div
      className="flex h-8 shrink-0 items-center overflow-x-auto border-b border-border bg-muted/20 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      onDragEnd={() => {
        dragIndexRef.current = null;
        setDragOverIndex(null);
      }}
    >
      {openedTabs.map((tab, index) => {
        const status = 'connectionId' in tab ? connectionStatus[tab.connectionId] : undefined;
        const connection =
          'connectionId' in tab ? connections?.find((item) => item.id === tab.connectionId) : undefined;
        const signalColor = getIndicatorColor(connection, status);

        const isLastTab = index === openedTabs.length - 1;
        const hasOtherTabs = openedTabs.length > 1;
        const canDuplicate = ['query', 'redis-query', 'mongo-query', 'federated-query'].includes(tab.type);

        return (
          <ContextMenu key={tab.id}>
            <ContextMenuTrigger
              role="button"
              tabIndex={0}
              draggable
              onDragStart={(e) => {
                dragIndexRef.current = index;
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', String(index));
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (dragOverIndex !== index) setDragOverIndex(index);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const from = dragIndexRef.current;
                dragIndexRef.current = null;
                setDragOverIndex(null);
                if (typeof from === 'number' && from >= 0 && from !== index) {
                  reorderTabs(from, index);
                }
              }}
              className={`flex h-full shrink-0 cursor-pointer items-center gap-1.5 border-r border-border px-3 text-xs transition-colors ${
                tab.id === activeTabId ? 'border-b-2 border-b-primary bg-background' : 'hover:bg-muted/50'
              } ${dragOverIndex === index ? 'border-l-2 border-l-primary' : ''}`}
              onClick={() =>
                appStore.setState((state) => ({
                  ...state,
                  activeTabId: tab.id,
                  activeConnectionId: 'connectionId' in tab ? tab.connectionId : null,
                }))
              }
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  appStore.setState((state) => ({
                    ...state,
                    activeTabId: tab.id,
                    activeConnectionId: 'connectionId' in tab ? tab.connectionId : null,
                  }));
                }
              }}
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: signalColor }} />
              {tabIcon(tab.type)}
              <span className="max-w-30 truncate">{tab.title}</span>
              {tab.pinned && <Pin className="size-3 shrink-0 text-muted-foreground" />}
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="ml-1 rounded-sm hover:bg-muted"
                onClick={(event) => {
                  event.stopPropagation();
                  closeTab(tab.id);
                }}
                aria-label={`Close ${tab.title} tab`}
              >
                <X className="size-3" />
              </Button>
            </ContextMenuTrigger>
            <ContextMenuContent>
              {tab.type === 'query' && (
                <ContextMenuItem
                  onClick={() => {
                    setTabToRename(tab);
                    setRenameValue(tab.title);
                  }}
                >
                  <Pencil className="size-4" />
                  <span>Rename</span>
                </ContextMenuItem>
              )}
              <ContextMenuItem onClick={() => toggleTabPin(tab.id)}>
                {tab.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
                <span>{tab.pinned ? 'Unpin Tab' : 'Pin Tab'}</span>
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={() => closeTab(tab.id)}>
                <span>Close</span>
                <ContextMenuShortcut>Ctrl+W</ContextMenuShortcut>
              </ContextMenuItem>
              {hasOtherTabs && (
                <ContextMenuItem onClick={() => closeOtherTabs(tab.id)}>
                  <span>Close Others</span>
                </ContextMenuItem>
              )}
              {hasOtherTabs && !isLastTab && (
                <ContextMenuItem onClick={() => closeTabsToRight(tab.id)}>
                  <span>Close to the Right</span>
                </ContextMenuItem>
              )}
              <ContextMenuItem onClick={() => closeAllTabs()}>
                <span>Close All</span>
                <ContextMenuShortcut>Ctrl+Shift+W</ContextMenuShortcut>
              </ContextMenuItem>
              {canDuplicate && (
                <>
                  <ContextMenuSeparator />
                  <ContextMenuItem onClick={() => duplicateTab(tab.id)}>
                    <Copy className="size-4" />
                    <span>Duplicate Tab</span>
                  </ContextMenuItem>
                </>
              )}
            </ContextMenuContent>
          </ContextMenu>
        );
      })}

      <Dialog
        open={tabToRename !== null}
        onOpenChange={(open) => {
          if (!open) {
            setTabToRename(null);
            setRenameValue('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Query Tab</DialogTitle>
            <DialogDescription>Choose a name for this query tab.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRenameSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rename-query-tab">Tab name</Label>
              <Input
                id="rename-query-tab"
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                autoFocus
              />
            </div>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
              <Button type="submit" disabled={!renameValue.trim()}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {activeConnectionId && (
        <>
          {activeTab && (activeTab.type === 'redis-query' || activeTab.type === 'redis') ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="flex h-full shrink-0 items-center justify-center px-2 rounded-none text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              onClick={() => openRedisQueryTab(activeTab.connectionId)}
              title="Redis Query"
            >
              <Terminal className="size-3.5" />
            </Button>
          ) : activeTab && (activeTab.type === 'mongo-query' || activeTab.type === 'mongo') ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="flex h-full shrink-0 items-center justify-center px-2 rounded-none text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              onClick={() => {
                const mongoDatabase = appStore.state.activeMongoDatabase;
                const database = 'database' in activeTab ? activeTab.database : (mongoDatabase ?? 'admin');
                const collection = 'collection' in activeTab ? activeTab.collection : '';
                openMongoQueryTab(activeTab.connectionId, database, collection);
              }}
              title="New Aggregation"
            >
              <Database className="size-3.5" />
            </Button>
          ) : activeConnection && isSqlKind(activeConnection.kind) && activeTab && 'connectionId' in activeTab ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="flex h-full shrink-0 items-center justify-center px-2 rounded-none text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                onClick={() => openNewQueryTab(activeTab.connectionId)}
                title="New Query"
              >
                <Plus className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="flex h-full shrink-0 items-center justify-center px-2 rounded-none text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                onClick={() => openGraphTab(activeTab.connectionId)}
                title="Schema Graph"
              >
                <Share2 className="size-3.5" />
              </Button>
            </>
          ) : null}
        </>
      )}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="flex h-full shrink-0 items-center justify-center px-2 rounded-none text-muted-foreground hover:bg-muted/50 hover:text-foreground"
        onClick={() => openFederatedQueryTab()}
        title="Federated Query"
      >
        <GitCompare className="size-3.5" />
      </Button>

      {openedTabs.length > 0 && (
        <ContextMenu>
          <ContextMenuTrigger
            className="flex-1 h-full min-w-2"
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
            }}
            onDrop={(e) => {
              e.preventDefault();
              const from = dragIndexRef.current;
              dragIndexRef.current = null;
              setDragOverIndex(null);
              if (typeof from === 'number' && from >= 0 && from !== openedTabs.length - 1) {
                reorderTabs(from, openedTabs.length - 1);
              }
            }}
          />
          <ContextMenuContent>
            <ContextMenuItem onClick={() => closeAllTabs()}>
              <span>Close All</span>
              <ContextMenuShortcut>Ctrl+Shift+W</ContextMenuShortcut>
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      )}
    </div>
  );
}
