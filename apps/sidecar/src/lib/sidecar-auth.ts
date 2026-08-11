// A packaged sidecar receives a random token from Tauri. Development keeps
// manual `pnpm dev:sidecar` workflows working without an extra secret.
export function isAuthorizedSidecarRequest(
  expectedToken: string | undefined,
  providedToken: string | undefined,
): boolean {
  return expectedToken === undefined || providedToken === expectedToken;
}
