import { QdrantClient } from '@qdrant/js-client-rest';
import type { Schemas } from '@qdrant/js-client-rest';
import type {
  QdrantAdapter,
  TestConnectionResult,
  QdrantCollection,
  QdrantPointPage,
  QdrantSearchResult,
  QdrantStats,
  ScrollPointsInput,
  QdrantSearchInput,
  RecommendInput,
} from '@kamehadb/shared';

// Qdrant client 1.18.0 omits `using` from the search() parameter type, but
// the runtime forwards it for named-vector queries. Extend the parameter
// type so the request can carry `using` through to the wire.
type SearchRequestWithUsing = Parameters<QdrantClient['search']>[1] & { using?: string };

interface QdrantConfig {
  host?: string;
  port?: number;
}

// The vectors config can be a single unnamed vector { size, distance } or a
// map of named vectors { name: { size, distance } }. Pick the first one for display.
function readVectorParams(vectors: unknown): { size?: number; distance?: string } {
  if (!vectors || typeof vectors !== 'object') return {};
  const v = vectors as Record<string, unknown>;
  if (typeof v.size === 'number') {
    return { size: v.size, distance: typeof v.distance === 'string' ? v.distance : undefined };
  }
  const first = Object.values(v)[0];
  if (first && typeof first === 'object') {
    const fv = first as Record<string, unknown>;
    return {
      size: typeof fv.size === 'number' ? fv.size : undefined,
      distance: typeof fv.distance === 'string' ? fv.distance : undefined,
    };
  }
  return {};
}

export function createQdrantAdapter(config: QdrantConfig): QdrantAdapter {
  let client: QdrantClient | null = null;

  function getClient(): QdrantClient {
    if (!client) {
      const host = config.host ?? 'localhost';
      const port = config.port ?? 6333;
      client = new QdrantClient({ url: `http://${host}:${port}`, checkCompatibility: false });
    }
    return client;
  }

  return {
    async testConnection(): Promise<TestConnectionResult> {
      try {
        await getClient().getCollections();
        return { success: true, serverVersion: 'Qdrant' };
      } catch (err) {
        return {
          success: false,
          message: err instanceof Error ? err.message : 'Connection failed',
        };
      }
    },

    async listCollections(): Promise<QdrantCollection[]> {
      const qdrant = getClient();
      const { collections } = await qdrant.getCollections();
      return Promise.all(
        collections.map(async ({ name }) => {
          const info = await qdrant.getCollection(name);
          const { size, distance } = readVectorParams(info.config?.params?.vectors);
          return {
            name,
            vectorSize: size,
            distance,
            pointsCount: info.points_count ?? 0,
            status: info.status,
          };
        }),
      );
    },

    async scrollPoints(input: ScrollPointsInput): Promise<QdrantPointPage> {
      const qdrant = getClient();
      const result = await qdrant.scroll(input.collection, {
        limit: input.limit ?? 50,
        offset: input.offset ?? undefined,
        filter: input.filter as never,
        with_payload: input.withPayload ?? true,
        with_vector: input.withVector ?? false,
      });
      return {
        points: result.points.map((p) => ({
          id: p.id,
          payload: (p.payload as Record<string, unknown> | null) ?? undefined,
          vector: (p.vector as QdrantPointPage['points'][number]['vector']) ?? undefined,
        })),
        nextOffset: (result.next_page_offset as string | number | null) ?? null,
      };
    },

    async search(input: QdrantSearchInput): Promise<QdrantSearchResult> {
      const qdrant = getClient();
      const start = Date.now();
      const request: SearchRequestWithUsing = {
        vector: input.vector as Schemas['NamedVectorStruct'],
        limit: input.limit ?? 10,
        filter: input.filter,
        with_payload: input.withPayload ?? true,
        with_vector: input.withVector ?? false,
        using: input.using,
      };
      const hits = await qdrant.search(input.collection, request);
      return {
        hits: hits.map((h) => ({
          id: h.id,
          score: h.score,
          payload: (h.payload as Record<string, unknown> | null) ?? undefined,
          vector: (h.vector as QdrantSearchResult['hits'][number]['vector']) ?? undefined,
        })),
        durationMs: Date.now() - start,
      };
    },

    async recommend(input: RecommendInput): Promise<QdrantSearchResult> {
      const qdrant = getClient();
      const start = Date.now();
      const hits = await qdrant.recommend(input.collection, {
        positive: [input.pointId],
        limit: input.limit ?? 10,
        filter: input.filter as never,
        with_payload: input.withPayload ?? true,
        with_vector: input.withVector ?? false,
        using: input.using,
      });
      return {
        hits: hits.map((h) => ({
          id: h.id,
          score: h.score,
          payload: (h.payload as Record<string, unknown> | null) ?? undefined,
          vector: (h.vector as QdrantSearchResult['hits'][number]['vector']) ?? undefined,
        })),
        durationMs: Date.now() - start,
      };
    },

    async getStats(collection: string): Promise<QdrantStats> {
      const info = await getClient().getCollection(collection);
      const { size, distance } = readVectorParams(info.config?.params?.vectors);
      return {
        name: collection,
        status: info.status,
        pointsCount: info.points_count ?? 0,
        vectorsCount: info.points_count ?? info.indexed_vectors_count ?? undefined,
        indexedVectorsCount: info.indexed_vectors_count ?? undefined,
        segmentsCount: info.segments_count ?? undefined,
        vectorSize: size,
        distance,
      };
    },

    async close(): Promise<void> {
      client = null;
    },
  };
}
