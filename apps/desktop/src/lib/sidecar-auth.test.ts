import { describe, expect, it } from 'vitest';
import { isAuthorizedSidecarRequest, isTokenQueryAllowed } from '../../../sidecar/src/lib/sidecar-auth';

describe('isAuthorizedSidecarRequest', () => {
  it('requires the launch token when one is configured', () => {
    expect(isAuthorizedSidecarRequest('launch-token', undefined)).toBe(false);
    expect(isAuthorizedSidecarRequest('launch-token', 'wrong-token')).toBe(false);
    expect(isAuthorizedSidecarRequest('launch-token', 'launch-token')).toBe(true);
  });

  it('keeps manually started development sidecars usable', () => {
    expect(isAuthorizedSidecarRequest(undefined, undefined)).toBe(true);
  });

  it('allows URL tokens only for streams that cannot set headers', () => {
    expect(isTokenQueryAllowed('/connections/health')).toBe(true);
    expect(isTokenQueryAllowed('/mongo/conn/shell/session/stream')).toBe(true);
    expect(isTokenQueryAllowed('/connections')).toBe(false);
  });
});
