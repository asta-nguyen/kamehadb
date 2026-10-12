import { api } from '@/lib/api';
import { SCHEMA_CACHE_TIME, STATS_CACHE_TIME } from '@/lib/constants';
import { QUERY_KEYS } from '@/lib/query-keys';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

export function useSchemas(connectionId: string | null) {
  return useQuery({
    queryKey: QUERY_KEYS.SCHEMAS(connectionId),
    queryFn: () => api.listSqlSchemas(connectionId!),
    enabled: !!connectionId,
    staleTime: SCHEMA_CACHE_TIME,
  });
}

export function useTables(connectionId: string | null, schema?: string) {
  return useQuery({
    queryKey: QUERY_KEYS.TABLES(connectionId, schema),
    queryFn: () => api.listTables(connectionId!, schema),
    enabled: !!connectionId,
    staleTime: SCHEMA_CACHE_TIME,
  });
}

export function useTableColumns(connectionId: string | null, tableId: string | null) {
  return useQuery({
    queryKey: QUERY_KEYS.COLUMNS(connectionId, tableId),
    queryFn: () => api.getTableColumns(connectionId!, tableId!),
    enabled: !!connectionId && !!tableId,
    staleTime: SCHEMA_CACHE_TIME,
  });
}

export function useTableIndexes(connectionId: string | null, tableId: string | null) {
  return useQuery({
    queryKey: QUERY_KEYS.INDEXES(connectionId, tableId),
    queryFn: () => api.getTableIndexes(connectionId!, tableId!),
    enabled: !!connectionId && !!tableId,
    staleTime: SCHEMA_CACHE_TIME,
  });
}

export function usePreviewRows(connectionId: string | null, input: import('@kamehadb/shared').PreviewRowsInput | null) {
  return useQuery({
    queryKey: QUERY_KEYS.PREVIEW(connectionId, input),
    queryFn: () => api.previewRows(connectionId!, input!),
    enabled: !!connectionId && !!input,
    staleTime: STATS_CACHE_TIME,
    placeholderData: keepPreviousData,
  });
}

export function useTableStats(connectionId: string | null, tableId: string | null) {
  return useQuery({
    queryKey: QUERY_KEYS.TABLE_STATS(connectionId, tableId),
    queryFn: () => api.getTableStats(connectionId!, tableId!),
    enabled: !!connectionId && !!tableId,
    staleTime: STATS_CACHE_TIME,
  });
}

export function useIndexStats(connectionId: string | null, tableId: string | null) {
  return useQuery({
    queryKey: QUERY_KEYS.INDEX_STATS(connectionId, tableId),
    queryFn: () => api.getIndexStats(connectionId!, tableId!),
    enabled: !!connectionId && !!tableId,
    staleTime: STATS_CACHE_TIME,
  });
}

export function useDatabaseSizes(connectionId: string | null, schema?: string) {
  return useQuery({
    queryKey: QUERY_KEYS.DATABASES(connectionId, schema),
    queryFn: () => api.getDatabaseSizes(connectionId!, schema),
    enabled: !!connectionId,
    staleTime: STATS_CACHE_TIME,
  });
}
