import { api } from '@/lib/api';
import { SCHEMA_CACHE_TIME, STATS_CACHE_TIME } from '@/lib/constants';
import { QUERY_KEYS } from '@/lib/query-keys';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

export function useSchemas(connectionId: string | null) {
  return useQuery({
    queryKey: QUERY_KEYS.SCHEMAS(connectionId),
    queryFn: () => api.request<import('@kamehadb/shared').SchemaInfo[]>('GET', `/sql/${connectionId}/schemas`),
    enabled: !!connectionId,
    staleTime: SCHEMA_CACHE_TIME,
  });
}

export function useTables(connectionId: string | null, schema?: string) {
  return useQuery({
    queryKey: QUERY_KEYS.TABLES(connectionId, schema),
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
    queryKey: QUERY_KEYS.COLUMNS(connectionId, tableId),
    queryFn: () =>
      api.request<import('@kamehadb/shared').ColumnInfo[]>('GET', `/sql/${connectionId}/tables/${tableId}/columns`),
    enabled: !!connectionId && !!tableId,
    staleTime: SCHEMA_CACHE_TIME,
  });
}

export function useTableIndexes(connectionId: string | null, tableId: string | null) {
  return useQuery({
    queryKey: QUERY_KEYS.INDEXES(connectionId, tableId),
    queryFn: () =>
      api.request<import('@kamehadb/shared').IndexInfo[]>('GET', `/sql/${connectionId}/tables/${tableId}/indexes`),
    enabled: !!connectionId && !!tableId,
    staleTime: SCHEMA_CACHE_TIME,
  });
}

export function usePreviewRows(connectionId: string | null, input: import('@kamehadb/shared').PreviewRowsInput | null) {
  return useQuery({
    queryKey: QUERY_KEYS.PREVIEW(connectionId, input),
    queryFn: () => api.request<import('@kamehadb/shared').QueryResult>('POST', `/sql/${connectionId}/rows`, input!),
    enabled: !!connectionId && !!input,
    staleTime: STATS_CACHE_TIME,
    placeholderData: keepPreviousData,
  });
}

export function useTableStats(connectionId: string | null, tableId: string | null) {
  return useQuery({
    queryKey: QUERY_KEYS.TABLES(connectionId, tableId),
    queryFn: () =>
      api.request<import('@kamehadb/shared').TableStats>('GET', `/sql/${connectionId}/tables/${tableId}/stats`),
    enabled: !!connectionId && !!tableId,
    staleTime: STATS_CACHE_TIME,
  });
}

export function useIndexStats(connectionId: string | null, tableId: string | null) {
  return useQuery({
    queryKey: QUERY_KEYS.INDEXES(connectionId, tableId),
    queryFn: () =>
      api.request<import('@kamehadb/shared').IndexStats[]>(
        'GET',
        `/sql/${connectionId}/tables/${tableId}/indexes/stats`,
      ),
    enabled: !!connectionId && !!tableId,
    staleTime: STATS_CACHE_TIME,
  });
}

export function useDatabaseSizes(connectionId: string | null, schema?: string) {
  return useQuery({
    queryKey: QUERY_KEYS.DATABASES(connectionId, schema),
    queryFn: () => {
      const params = schema ? `?schema=${encodeURIComponent(schema)}` : '';
      return api.request<import('@kamehadb/shared').DatabaseSize[]>(
        'GET',
        `/sql/${connectionId}/database/sizes${params}`,
      );
    },
    enabled: !!connectionId,
    staleTime: STATS_CACHE_TIME,
  });
}
