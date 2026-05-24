let apiBase = "http://127.0.0.1:3170";

export function setApiPort(port: number) {
  apiBase = `http://127.0.0.1:${port}`;
}

export function getApiBase(): string {
  return apiBase;
}

export async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${apiBase}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || `API error: ${res.status}`);
  }
  return data as T;
}

export const api = {
  request: request as <T>(method: string, path: string, body?: unknown) => Promise<T>,
  health: () => request<{ status: string; uptime: number; version: string }>("GET", "/health"),

  listConnections: () =>
    request<import("@kamehadb/shared").ConnectionProfile[]>("GET", "/connections"),

  getConnection: (id: string) =>
    request<import("@kamehadb/shared").ConnectionProfile>("GET", `/connections/${id}`),

  createConnection: (input: import("@kamehadb/shared").CreateConnectionProfileInput) =>
    request<import("@kamehadb/shared").ConnectionProfile>("POST", "/connections", input),

  updateConnection: (id: string, input: import("@kamehadb/shared").UpdateConnectionProfileInput) =>
    request<import("@kamehadb/shared").ConnectionProfile>("PATCH", `/connections/${id}`, input),

  deleteConnection: (id: string) =>
    request<void>("DELETE", `/connections/${id}`),

  testConnection: (input: import("@kamehadb/shared").CreateConnectionProfileInput) =>
    request<import("@kamehadb/shared").TestConnectionResult>("POST", "/connections/test", input),
};
