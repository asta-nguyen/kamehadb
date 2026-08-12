import { SIDECAR_AUTH_HEADER, SIDECAR_AUTH_TOKEN_QUERY_PARAM } from '@kamehadb/shared';

const DEV_PROXY_API_BASE = 'http://127.0.0.1:3170';
const DIRECT_SIDECAR_API_BASE = 'http://127.0.0.1:3170';
const SIDECAR_API_BASE = 'http://127.0.0.1:3170';

let apiBase = import.meta.env.DEV ? DEV_PROXY_API_BASE : DIRECT_SIDECAR_API_BASE;
let sidecarBase = SIDECAR_API_BASE;
let sidecarToken: string | undefined;

export function getApiBase(): string {
  return apiBase;
}

export function setApiBase(port: number, token?: string): void {
  apiBase = `http://127.0.0.1:${port}`;
  sidecarBase = `http://127.0.0.1:${port}`;
  sidecarToken = token;
}

export function getApiHeaders(headers?: Record<string, string>): Record<string, string> {
  return sidecarToken ? { ...headers, [SIDECAR_AUTH_HEADER]: sidecarToken } : (headers ?? {});
}

export function getAuthenticatedApiUrl(path: string, useSidecar = false): string {
  const url = new URL(path, useSidecar ? sidecarBase : apiBase);
  if (sidecarToken) url.searchParams.set(SIDECAR_AUTH_TOKEN_QUERY_PARAM, sidecarToken);
  return url.toString();
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
    headers: getApiHeaders(body ? { 'Content-Type': 'application/json' } : undefined),
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
