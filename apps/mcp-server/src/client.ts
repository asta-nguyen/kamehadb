import { getSidecarUrl } from './config.js';

export class SidecarError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly sidecarMessage: string,
  ) {
    super(`${code}: ${sidecarMessage}`);
  }
}

type SidecarBody = { error?: string; message?: string } | null;

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const url = `${getSidecarUrl()}${path}`;
  const start = Date.now();
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    const durationMs = Date.now() - start;
    process.stderr.write(`[mcp] ${method} ${path} connection_error ${durationMs}ms\n`);
    const reason = err instanceof Error ? err.message : String(err);
    throw new SidecarError(0, 'CONNECTION_ERROR', `Could not reach sidecar at ${getSidecarUrl()}: ${reason}`);
  }
  const durationMs = Date.now() - start;
  process.stderr.write(`[mcp] ${method} ${path} ${res.status} ${durationMs}ms\n`);

  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => null)) as SidecarBody;
  if (!res.ok) {
    throw new SidecarError(res.status, data?.error ?? 'UNKNOWN', data?.message ?? `HTTP ${res.status}`);
  }
  return data as T;
}

export function sidecarGet<T>(path: string): Promise<T> {
  return request<T>('GET', path);
}

export function sidecarPost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>('POST', path, body);
}
