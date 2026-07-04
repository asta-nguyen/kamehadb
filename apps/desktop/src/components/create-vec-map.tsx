import type { ReactNode } from 'react';
import { DatabaseVectorMap } from '@/components/database-vector-map';
import type { VectorPoint } from '@/components/vector-map-3d';

type CameraState = {
  readonly position: [number, number, number];
  readonly target: [number, number, number];
};

export function createVecMapComponent<TTab extends { readonly id: string; readonly camera?: CameraState }>(config: {
  readonly useVectorsSample: (...args: any[]) => any;
  readonly openSearchTab: (...args: any[]) => void;
  readonly updateMapState: (tabId: string, updates: { camera?: CameraState }) => void;
  readonly getSampleInput: (tab: TTab) => any;
  readonly getHeader: (tab: TTab) => ReactNode;
  readonly getSearchInput: (tab: TTab, point: VectorPoint) => any;
}) {
  function VecMap({ tab, connectionId }: { readonly tab: TTab; readonly connectionId: string }) {
    const sample = config.useVectorsSample(connectionId, config.getSampleInput(tab));

    return (
      <DatabaseVectorMap
        sample={sample}
        header={config.getHeader(tab)}
        initialCamera={tab.camera}
        onPointClick={(point) => config.openSearchTab(connectionId, config.getSearchInput(tab, point))}
        onCameraChange={(camera) => config.updateMapState(tab.id, { camera })}
      />
    );
  }

  return VecMap;
}
