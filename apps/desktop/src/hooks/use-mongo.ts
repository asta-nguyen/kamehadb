import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { get, post } from '@/lib/api';
import type { CollectionInfo, DatabaseInfo, DocumentResult, FindDocumentsInput } from '@kamehadb/shared';

const SCHEMA_CACHE_TIME = 5 * 60 * 1000;
const STATS_CACHE_TIME = 30 * 1000;

export function useMongoDatabases(connectionId: string | null) {
  return useQuery({
    queryKey: ['mongo', connectionId, 'databases'],
    queryFn: () => get<DatabaseInfo[]>(`/mongo/${connectionId}/databases`),
    enabled: !!connectionId,
    staleTime: SCHEMA_CACHE_TIME,
  });
}

export function useMongoCollections(connectionId: string | null, database: string | null) {
  return useQuery({
    queryKey: ['mongo', connectionId, database, 'collections'],
    queryFn: () =>
      get<CollectionInfo[]>(`/mongo/${connectionId}/collections?database=${encodeURIComponent(database ?? '')}`),
    enabled: !!connectionId && !!database,
    staleTime: SCHEMA_CACHE_TIME,
  });
}

export function useMongoDocuments(
  connectionId: string | null,
  database: string | null,
  collection: string | null,
  filter: Record<string, unknown> = {},
  sort: Record<string, 1 | -1> = {},
  limit: number = 100,
  skip: number = 0,
  search?: string,
) {
  return useQuery({
    queryKey: [
      'mongo',
      connectionId,
      database,
      collection,
      'documents',
      JSON.stringify({ filter, sort, limit, skip, search }),
    ],
    queryFn: () => {
      const input: FindDocumentsInput = {
        collection: collection!,
        database: database ?? undefined,
        filter,
        sort,
        limit,
        skip,
        search,
      };
      return post<DocumentResult>(`/mongo/${connectionId}/find`, input);
    },
    enabled: !!connectionId && !!database && !!collection,
    staleTime: STATS_CACHE_TIME,
    placeholderData: keepPreviousData,
  });
}

export function useMongoCollectionStats(
  connectionId: string | null,
  database: string | null,
  collection: string | null,
) {
  return useQuery({
    queryKey: ['mongo-stats', connectionId, database, collection],
    queryFn: () =>
      get<{ documentCount: number; indexes: { name: string; key: Record<string, unknown>; unique: boolean }[] }>(
        `/mongo/${connectionId}/stats?database=${encodeURIComponent(database ?? '')}&collection=${encodeURIComponent(collection ?? '')}`,
      ),
    enabled: !!connectionId && !!database && !!collection,
    staleTime: STATS_CACHE_TIME,
  });
}
