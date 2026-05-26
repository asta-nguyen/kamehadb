import { useQuery } from '@tanstack/react-query';
import { get, post } from '@/lib/api';
import type { CollectionInfo, DatabaseInfo, DocumentResult, FindDocumentsInput } from '@kamehadb/shared';

export function useMongoDatabases(connectionId: string | null) {
  return useQuery({
    queryKey: ['mongo', connectionId, 'databases'],
    queryFn: () => get<DatabaseInfo[]>(`/mongo/${connectionId}/databases`),
    enabled: !!connectionId,
  });
}

export function useMongoCollections(connectionId: string | null, database: string | null) {
  return useQuery({
    queryKey: ['mongo', connectionId, database, 'collections'],
    queryFn: () =>
      get<CollectionInfo[]>(`/mongo/${connectionId}/collections?database=${encodeURIComponent(database ?? '')}`),
    enabled: !!connectionId && !!database,
  });
}

export function useMongoDocuments(
  connectionId: string | null,
  database: string | null,
  collection: string | null,
  filter: Record<string, unknown> = {},
  sort: Record<string, 1 | -1> = {},
  limit: number = 100,
) {
  return useQuery({
    queryKey: ['mongo', connectionId, database, collection, 'documents', JSON.stringify({ filter, sort, limit })],
    queryFn: () => {
      const input: FindDocumentsInput = {
        collection: collection!,
        database: database ?? undefined,
        filter,
        sort,
        limit,
      };
      return post<DocumentResult>(`/mongo/${connectionId}/find`, input);
    },
    enabled: !!connectionId && !!database && !!collection,
  });
}
