import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { WorkspaceTab } from '@/lib/types';
import { QUERY_KEYS } from '@/lib/query-keys';
import { api } from '@/lib/api';
import { openQdrantSearchTab, updateTabQdrantGraphState } from '@/store';
import { VECTOR_PALETTE, VectorMap3D, type VectorPoint, type LegendItem } from '@/components/vector-map-3d';

const SAMPLE_LIMIT = 500;

interface QdrantVectorMapProps {
  tab: WorkspaceTab & { type: 'qdrant-graph' };
  connectionId: string;
  collection: string;
  vectorName?: string;
}

function toNumericVector(vector: unknown, vectorName?: string): number[] | null {
  if (Array.isArray(vector) && typeof vector[0] === 'number') return vector as number[];
  if (vector && typeof vector === 'object') {
    const obj = vector as Record<string, unknown>;
    if (vectorName && vectorName in obj) {
      const v = obj[vectorName];
      if (Array.isArray(v) && typeof v[0] === 'number') return v as number[];
    }
    if (!vectorName) {
      const keys = Object.keys(obj);
      if (keys.length === 1) {
        const v = obj[keys[0]];
        if (Array.isArray(v) && typeof v[0] === 'number') return v as number[];
      }
    }
  }
  return null;
}

export function QdrantVectorMap({ tab, connectionId, collection, vectorName }: QdrantVectorMapProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: QUERY_KEYS.QDRANT_MAP(connectionId, collection),
    queryFn: () =>
      api.scrollQdrantPoints(connectionId, {
        collection,
        limit: SAMPLE_LIMIT,
        withPayload: true,
        withVector: true,
      }),
    staleTime: 30000,
  });

  const [colorBy, setColorBy] = useState<string>(tab.colorBy || '');

  useEffect(() => {
    updateTabQdrantGraphState(tab.id, { colorBy });
  }, [tab.id, colorBy]);

  const points = useMemo<VectorPoint[]>(() => {
    if (!data) return [];
    return data.points
      .map((p) => ({ id: p.id, payload: p.payload ?? {}, vector: toNumericVector(p.vector, vectorName) }))
      .filter((p): p is VectorPoint => !!p.vector);
  }, [data, vectorName]);

  const payloadKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const p of points) for (const k of Object.keys(p.payload)) keys.add(k);
    return [...keys];
  }, [points]);

  const { legend, colorValue } = useMemo<{ legend: LegendItem[]; colorValue: (i: number) => string }>(() => {
    if (!colorBy) return { legend: [], colorValue: () => VECTOR_PALETTE[0] };
    const values = [...new Set(points.map((p) => String(p.payload[colorBy] ?? '∅')))];
    const map = new Map(values.map((v, i) => [v, VECTOR_PALETTE[i % VECTOR_PALETTE.length]]));
    return {
      legend: values.slice(0, 12).map((v) => ({ value: v, color: map.get(v)! })),
      colorValue: (i: number) => map.get(String(points[i].payload[colorBy] ?? '∅')) ?? VECTOR_PALETTE[0],
    };
  }, [colorBy, points]);

  return (
    <VectorMap3D
      points={points}
      isLoading={isLoading}
      error={error}
      header={
        <>
          <span className="font-mono">{collection}</span>
        </>
      }
      onPointClick={(point) => openQdrantSearchTab(connectionId, collection, { mode: 'similar', pointId: point.id })}
      onCameraChange={(camera) => updateTabQdrantGraphState(tab.id, { camera })}
      initialCamera={tab.camera as { position: [number, number, number]; target: [number, number, number] } | undefined}
      colorBy={colorBy}
      onColorByChange={setColorBy}
      payloadKeys={payloadKeys}
      colorValue={colorValue}
      legend={legend}
    />
  );
}
