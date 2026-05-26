import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useDatabases(connectionId: string | null) {
  return useQuery({
    queryKey: ['databases', connectionId],
    queryFn: () => api.request<import('@kamehadb/shared').DatabaseInfo[]>('GET', `/sql/${connectionId}/databases`),
    enabled: !!connectionId,
  });
}

export function useSchemas(connectionId: string | null) {
  return useQuery({
    queryKey: ['schemas', connectionId],
    queryFn: () => api.request<import('@kamehadb/shared').SchemaInfo[]>('GET', `/sql/${connectionId}/schemas`),
    enabled: !!connectionId,
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
  });
}

export function useTableColumns(connectionId: string | null, tableId: string | null) {
  return useQuery({
    queryKey: ['columns', connectionId, tableId],
    queryFn: () =>
      api.request<import('@kamehadb/shared').ColumnInfo[]>('GET', `/sql/${connectionId}/tables/${tableId}/columns`),
    enabled: !!connectionId && !!tableId,
  });
}

export function useTableIndexes(connectionId: string | null, tableId: string | null) {
  return useQuery({
    queryKey: ['indexes', connectionId, tableId],
    queryFn: () =>
      api.request<import('@kamehadb/shared').IndexInfo[]>('GET', `/sql/${connectionId}/tables/${tableId}/indexes`),
    enabled: !!connectionId && !!tableId,
  });
}

export function usePreviewRows(connectionId: string | null, input: import('@kamehadb/shared').PreviewRowsInput | null) {
  return useQuery({
    queryKey: ['preview', connectionId, input],
    queryFn: () => api.request<import('@kamehadb/shared').QueryResult>('POST', `/sql/${connectionId}/preview`, input!),
    enabled: !!connectionId && !!input,
  });
}
