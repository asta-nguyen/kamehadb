const SIDECAR_API_BASE = 'http://127.0.0.1:3170';

export function getApiBase(): string {
  return SIDECAR_API_BASE;
}

export async function request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${SIDECAR_API_BASE}${path}`, {
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

export async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  return request<T>('GET', path, undefined, signal);
}

export async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  return request<T>('POST', path, body, signal);
}
