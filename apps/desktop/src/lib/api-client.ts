const DEFAULT_API_BASE = 'http://127.0.0.1:3170';

let apiBase = DEFAULT_API_BASE;
let sidecarBase = DEFAULT_API_BASE;

export function getApiBase(): string {
  return apiBase;
}

export function setApiBase(port: number): void {
  apiBase = `http://127.0.0.1:${port}`;
  sidecarBase = `http://127.0.0.1:${port}`;
}

export async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  useSidecar = false,
  signal?: AbortSignal,
): Promise<T> {
  const base = useSidecar ? sidecarBase : apiBase;
  const response = await fetch(`${base}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });

  if (response.status === 204) return undefined as T;

  // Read the body as text first so a single read covers both the success
  // (JSON parse) and failure (text display) paths.  A Response body is a
  // ReadableStream — reading it twice (json() then text()) would fail.
  const bodyText = await response.text();
  let data: unknown;
  try {
    data = JSON.parse(bodyText);
  } catch {
    throw new Error(`API error (${response.status}): ${bodyText.slice(0, 200)}`);
  }
  if (!response.ok) {
    throw new Error((data as { message?: string }).message || `API error: ${response.status}`);
  }
  return data as T;
}

export async function get<T>(path: string, useSidecar = true): Promise<T> {
  return request<T>('GET', path, undefined, useSidecar);
}

export async function post<T>(path: string, body: unknown, useSidecar = true): Promise<T> {
  return request<T>('POST', path, body, useSidecar);
}
