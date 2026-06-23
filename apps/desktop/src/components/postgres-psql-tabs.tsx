import type { WorkspaceTab } from '@/lib/types';

import { PostgresPsqlTab } from '@/components/postgres-psql-tab';

type PostgresPsqlTabsProps = {
  readonly activeTabId: string | null;
  readonly tabs: Extract<WorkspaceTab, { readonly type: 'postgres-psql' }>[];
};

export function PostgresPsqlTabs({ activeTabId, tabs }: PostgresPsqlTabsProps) {
  return (
    <>
      {tabs.map((tab) => {
        const active = tab.id === activeTabId;
        return (
          <div key={tab.id} className={active ? 'h-full flex flex-col' : 'hidden'}>
            <PostgresPsqlTab active={active} tab={tab} />
          </div>
        );
      })}
    </>
  );
}
