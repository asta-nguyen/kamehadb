// A packaged sidecar receives a random token from Tauri. Development keeps
// manual `pnpm dev:sidecar` workflows working without an extra secret.
export function isAuthorizedSidecarRequest(
  expectedToken: string | undefined,
  providedToken: string | undefined,
): boolean {
  return expectedToken === undefined || providedToken === expectedToken;
}

// URL tokens are limited to native EventSource streams, whose API cannot set
// request headers; ordinary endpoints must keep the token out of the URL.
export function isTokenQueryAllowed(path: string): boolean {
  return path === '/connections/health' || /^\/mongo\/[^/]+\/shell\/[^/]+\/stream$/.test(path);
}
