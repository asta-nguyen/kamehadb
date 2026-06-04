import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api } from '@/lib/api';

const SCHEMA_CACHE_TIME = 5 * 60 * 1000;
const STATS_CACHE_TIME = 30 * 1000;

export function useDatabases(connectionId: string | null) {
  return useQuery({
    queryKey: ['databases', connectionId],
    queryFn: () => api.request<import('@kamehadb/shared').DatabaseInfo[]>('GET', `/sql/${connectionId}/databases`),
    enabled: !!connectionId,
    staleTime: SCHEMA_CACHE_TIME,
  });
}

export function useSchemas(connectionId: string | null) {
  return useQuery({
    queryKey: ['schemas', connectionId],
    queryFn: () => api.request<import('@kamehadb/shared').SchemaInfo[]>('GET', `/sql/${connectionId}/schemas`),
    enabled: !!connectionId,
    staleTime: SCHEMA_CACHE_TIME,
  });
}

export function useTables(connectionId: string | null, schema?: string) {
  return useQuery({
    queryKey: ['tables', connectionId, schema],
    queryFn: () => {
      const params = schema ? `?schema=${encodeURIComponent(schema)}` : '';
      return api.request<import('@kamehadb/shared').TableInfo[]>('GET', `/sql/${connectionId}/tables${params}`);
    },
    enabled: !!connectionId,
    staleTime: SCHEMA_CACHE_TIME,
  });
}

export function useTableColumns(connectionId: string | null, tableId: string | null) {
  return useQuery({
    queryKey: ['columns', connectionId, tableId],
    queryFn: () =>
      api.request<import('@kamehadb/shared').ColumnInfo[]>('GET', `/sql/${connectionId}/tables/${tableId}/columns`),
    enabled: !!connectionId && !!tableId,
    staleTime: SCHEMA_CACHE_TIME,
  });
}

export function useTableIndexes(connectionId: string | null, tableId: string | null) {
  return useQuery({
    queryKey: ['indexes', connectionId, tableId],
    queryFn: () =>
      api.request<import('@kamehadb/shared').IndexInfo[]>('GET', `/sql/${connectionId}/tables/${tableId}/indexes`),
    enabled: !!connectionId && !!tableId,
    staleTime: SCHEMA_CACHE_TIME,
  });
}

export function usePreviewRows(connectionId: string | null, input: import('@kamehadb/shared').PreviewRowsInput | null) {
  return useQuery({
    queryKey: ['preview', connectionId, input],
    queryFn: () => api.request<import('@kamehadb/shared').QueryResult>('POST', `/sql/${connectionId}/preview`, input!),
    enabled: !!connectionId && !!input,
    staleTime: STATS_CACHE_TIME,
    placeholderData: keepPreviousData,
  });
}

export function useTableStats(connectionId: string | null, tableId: string | null) {
  return useQuery({
    queryKey: ['table-stats', connectionId, tableId],
    queryFn: () =>
      api.request<import('@kamehadb/shared').TableStats>('GET', `/sql/${connectionId}/tables/${tableId}/stats`),
    enabled: !!connectionId && !!tableId,
    staleTime: STATS_CACHE_TIME,
  });
}

export function useIndexStats(connectionId: string | null, tableId: string | null) {
  return useQuery({
    queryKey: ['index-stats', connectionId, tableId],
    queryFn: () =>
      api.request<import('@kamehadb/shared').IndexStats[]>('GET', `/sql/${connectionId}/tables/${tableId}/index-stats`),
    enabled: !!connectionId && !!tableId,
    staleTime: STATS_CACHE_TIME,
  });
}

export function useSchemaSearch(connectionId: string | null, query: string, schema?: string) {
  return useQuery({
    queryKey: ['schema-search', connectionId, query, schema],
    queryFn: () => api.searchSchema(connectionId!, query, schema),
    enabled: !!connectionId && query.length >= 1,
    staleTime: STATS_CACHE_TIME,
  });
}

export function useDatabaseSizes(connectionId: string | null, schema?: string) {
  return useQuery({
    queryKey: ['db-sizes', connectionId, schema],
    queryFn: () => {
      const params = schema ? `?schema=${encodeURIComponent(schema)}` : '';
      return api.request<import('@kamehadb/shared').DatabaseSize[]>('GET', `/sql/${connectionId}/sizes${params}`);
    },
    enabled: !!connectionId,
    staleTime: STATS_CACHE_TIME,
  });
}
