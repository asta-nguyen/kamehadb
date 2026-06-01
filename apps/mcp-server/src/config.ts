const DEFAULT_SIDECAR_URL = 'http://127.0.0.1:3170';

export function getSidecarUrl(): string {
  const raw = process.env.KAMEHADB_SIDECAR_URL || DEFAULT_SIDECAR_URL;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`Invalid KAMEHADB_SIDECAR_URL: ${raw}. Expected format: http://host:port`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Invalid KAMEHADB_SIDECAR_URL: ${raw}. Protocol must be http or https.`);
  }
  return parsed.toString().replace(/\/$/, '');
}
