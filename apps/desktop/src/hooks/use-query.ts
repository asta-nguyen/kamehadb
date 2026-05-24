import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { isQuerySafe } from "@/lib/sql-safety";
import type { QueryResult } from "@kamehadb/shared";

export function useRunQuery(connectionId: string | null) {
  return useMutation({
    mutationFn: async ({
      query,
      params,
    }: {
      query: string;
      params?: unknown[];
    }): Promise<QueryResult> => {
      if (!connectionId) throw new Error("No active connection");

      const safety = isQuerySafe(query);
      if (!safety.safe) {
        throw new Error(safety.reason ?? "This query is not allowed in read-only mode");
      }

      return api.request<QueryResult>("POST", `/sql/${connectionId}/query`, { query, params });
    },
  });
}
