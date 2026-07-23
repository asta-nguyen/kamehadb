import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { WorkspaceTab } from '@/lib/types';
import { QUERY_KEYS } from '@/lib/query-keys';
import { api } from '@/lib/api';
import { SCHEMA_CACHE_TIME } from '@/lib/constants';
import { openQdrantSearchTab, updateTabQdrantGraphState } from '@/store';
import { VECTOR_PALETTE, VectorMap3D, type VectorPoint, type LegendItem } from '@/components/vector-map-3d';

const SAMPLE_LIMIT = 500;

interface QdrantVectorMapProps {
  tab: WorkspaceTab & { type: 'qdrant-graph' };
  connectionId: number;
  collection: string;
  vectorName?: string;
}

function toNumericVector(vector: unknown, vectorName?: string): number[] | null {
  if (Array.isArray(vector) && typeof vector[0] === 'number') return vector as number[];
  if (vector && typeof vector === 'object') {
    const obj = vector as Record<string, unknown>;
    if (vectorName && vectorName in obj) {
      const value = obj[vectorName];
      if (Array.isArray(value) && typeof value[0] === 'number') return value as number[];
    }
    if (!vectorName) {
      const keys = Object.keys(obj);
      if (keys.length === 1) {
        const value = obj[keys[0]];
        if (Array.isArray(value) && typeof value[0] === 'number') return value as number[];
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
    staleTime: SCHEMA_CACHE_TIME,
  });

  const [colorBy, setColorBy] = useState<string>(tab.colorBy || '');

  useEffect(() => {
    updateTabQdrantGraphState(tab.id, { colorBy });
  }, [tab.id, colorBy]);

  const points = useMemo<VectorPoint[]>(() => {
    if (!data) return [];
    return data.points
      .map((point) => ({
        id: point.id,
        payload: point.payload ?? {},
        vector: toNumericVector(point.vector, vectorName),
      }))
      .filter((point): point is VectorPoint => !!point.vector);
  }, [data, vectorName]);

  const payloadKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const point of points) for (const key of Object.keys(point.payload)) keys.add(key);
    return [...keys];
  }, [points]);

  const { legend, colorValue } = useMemo<{ legend: LegendItem[]; colorValue: (index: number) => string }>(() => {
    if (!colorBy) return { legend: [], colorValue: () => VECTOR_PALETTE[0] };
    const values = [...new Set(points.map((point) => String(point.payload[colorBy] ?? '∅')))];
    const colors = new Map(values.map((value, index) => [value, VECTOR_PALETTE[index % VECTOR_PALETTE.length]]));
    return {
      legend: values.slice(0, 12).map((value) => ({ value, color: colors.get(value)! })),
      colorValue: (index: number) => colors.get(String(points[index].payload[colorBy] ?? '∅')) ?? VECTOR_PALETTE[0],
    };
  }, [colorBy, points]);

  return (
    <VectorMap3D
      points={points}
      isLoading={isLoading}
      error={error}
      header={<span className="font-mono">{collection}</span>}
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
