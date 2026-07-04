import { useMemo, type ReactNode } from 'react';

import { VectorMap3D, type VectorPoint } from '@/components/vector-map-3d';

type CameraState = {
  readonly position: [number, number, number];
  readonly target: [number, number, number];
};

type VectorSampleState = {
  readonly data: { readonly points: readonly VectorPoint[] } | undefined;
  readonly isLoading: boolean;
  readonly error: Error | null;
};

type DatabaseVectorMapProps = {
  readonly sample: VectorSampleState;
  readonly header: ReactNode;
  readonly initialCamera?: CameraState;
  readonly onPointClick: (point: VectorPoint) => void;
  readonly onCameraChange: (camera: CameraState) => void;
};

export function DatabaseVectorMap({
  sample,
  header,
  initialCamera,
  onPointClick,
  onCameraChange,
}: DatabaseVectorMapProps) {
  const points = useMemo(() => (sample.data?.points ?? []).filter((point) => point.vector.length > 0), [sample.data]);

  return (
    <VectorMap3D
      points={points}
      isLoading={sample.isLoading}
      error={sample.error}
      header={header}
      initialCamera={initialCamera}
      onPointClick={onPointClick}
      onCameraChange={onCameraChange}
    />
  );
}
