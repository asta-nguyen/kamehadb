import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { SCHEMA_CACHE_TIME, STATS_CACHE_TIME } from '@/lib/constants';
import { QUERY_KEYS } from '@/lib/query-keys';
import type { FindDocumentsInput } from '@kamehadb/shared';

export function useMongoDatabases(connectionId: string | null) {
  return useQuery({
    queryKey: QUERY_KEYS.MONGO_DATABASES(connectionId),
    queryFn: () => {
      if (!connectionId) throw new Error('No active connection');
      return api.listMongoDatabases(connectionId);
    },
    enabled: !!connectionId,
    staleTime: SCHEMA_CACHE_TIME,
  });
}

export function useMongoCollections(connectionId: string | null, database: string | null) {
  return useQuery({
    queryKey: QUERY_KEYS.MONGO_COLLECTIONS(connectionId, database),
    queryFn: () => {
      if (!connectionId) throw new Error('No active connection');
      return api.listMongoCollections(connectionId, database ?? undefined);
    },
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
    queryKey: QUERY_KEYS.MONGO_DOCUMENTS(connectionId, database, collection, filter, sort, limit, skip, search),
    queryFn: () => {
      if (!connectionId || !collection) throw new Error('Missing connection or collection');
      const input: FindDocumentsInput = {
        collection,
        database: database ?? undefined,
        filter,
        sort,
        limit,
        skip,
        search,
      };
      return api.findMongoDocuments(connectionId, input);
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
    queryKey: QUERY_KEYS.MONGO_STATS(connectionId, database, collection),
    queryFn: () => {
      if (!connectionId || !database || !collection) throw new Error('Missing connection, database, or collection');
      return api.getMongoCollectionStats(connectionId, database, collection);
    },
    enabled: !!connectionId && !!database && !!collection,
    staleTime: STATS_CACHE_TIME,
  });
}
