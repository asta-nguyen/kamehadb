import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  const values = new Map<string, string>();
  const mockStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  };
  Object.defineProperty(globalThis, 'localStorage', { value: mockStorage, configurable: true });
  return mockStorage;
});

import {
  checkForUpdate,
  getCheckForUpdatesEnabled,
  getCurrentAppVersion,
  isNewerVersion,
  parseSemVer,
  setCachedReleaseInfo,
  setDismissedUpdateVersion,
  setStoredCheckForUpdates,
  type ReleaseInfo,
} from './update-check';

describe('update-check: parseSemVer', () => {
  it('parses standard versions with or without v prefix', () => {
    expect(parseSemVer('v2.0.1')).toEqual({ major: 2, minor: 0, patch: 1, prerelease: undefined });
    expect(parseSemVer('2.0.3')).toEqual({ major: 2, minor: 0, patch: 3, prerelease: undefined });
    expect(parseSemVer('v10.12.34')).toEqual({ major: 10, minor: 12, patch: 34, prerelease: undefined });
  });

  it('parses versions with prereleases and git suffixes', () => {
    expect(parseSemVer('v2.0.1-7-g5707e50')).toEqual({ major: 2, minor: 0, patch: 1, prerelease: '7-g5707e50' });
    expect(parseSemVer('2.0.4-beta.1')).toEqual({ major: 2, minor: 0, patch: 4, prerelease: 'beta.1' });
  });

  it('handles invalid versions gracefully', () => {
    expect(parseSemVer('')).toBeNull();
    expect(parseSemVer('invalid')).toBeNull();
    // @ts-expect-error test non-string input
    expect(parseSemVer(null)).toBeNull();
  });
});

describe('update-check: isNewerVersion', () => {
  it('detects newer major version', () => {
    expect(isNewerVersion('v3.0.0', '2.0.3')).toBe(true);
    expect(isNewerVersion('v1.9.9', '2.0.0')).toBe(false);
  });

  it('detects newer minor version', () => {
    expect(isNewerVersion('v2.1.0', '2.0.3')).toBe(true);
    expect(isNewerVersion('v2.0.3', '2.1.0')).toBe(false);
  });

  it('detects newer patch version', () => {
    expect(isNewerVersion('v2.0.4', '2.0.3')).toBe(true);
    expect(isNewerVersion('v2.0.2', '2.0.3')).toBe(false);
  });

  it('returns false for equal versions', () => {
    expect(isNewerVersion('v2.0.3', '2.0.3')).toBe(false);
    expect(isNewerVersion('2.0.3', 'v2.0.3')).toBe(false);
  });

  it('considers release newer than prerelease', () => {
    expect(isNewerVersion('v2.0.3', '2.0.3-rc.1')).toBe(true);
    expect(isNewerVersion('v2.0.3-beta', '2.0.3')).toBe(false);
  });
});

describe('update-check: checkForUpdate', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('honors check_for_updates opt-out setting', async () => {
    setStoredCheckForUpdates(false);
    expect(getCheckForUpdatesEnabled()).toBe(false);

    const res = await checkForUpdate();
    expect(res.status).toBe('disabled');
  });

  it('returns cached update when within 6-hour throttle window', async () => {
    const cached: ReleaseInfo = {
      version: '2.5.0',
      tagName: 'v2.5.0',
      name: 'KamehaDB v2.5.0',
      htmlUrl: 'https://github.com/asta-nguyen/kamehadb/releases/tag/v2.5.0',
      body: 'Exciting release',
      publishedAt: '2026-10-18T00:00:00Z',
      checkedAt: Date.now() - 1000, // 1 second ago
    };
    setCachedReleaseInfo(cached);

    const res = await checkForUpdate();
    expect(res.status).toBe('update-available');
    if (res.status === 'update-available') {
      expect(res.release.tagName).toBe('v2.5.0');
    }
  });

  it('suppresses update notice if the version was dismissed', async () => {
    const cached: ReleaseInfo = {
      version: '2.5.0',
      tagName: 'v2.5.0',
      name: 'KamehaDB v2.5.0',
      htmlUrl: 'https://github.com/asta-nguyen/kamehadb/releases/tag/v2.5.0',
      body: 'Exciting release',
      publishedAt: '2026-10-18T00:00:00Z',
      checkedAt: Date.now() - 1000,
    };
    setCachedReleaseInfo(cached);
    setDismissedUpdateVersion('v2.5.0');

    const res = await checkForUpdate();
    expect(res.status).toBe('up-to-date');
  });

  it('fetches remote release when cache is expired or missing', async () => {
    const mockRelease = {
      tag_name: 'v2.9.0',
      name: 'KamehaDB v2.9.0',
      html_url: 'https://github.com/asta-nguyen/kamehadb/releases/tag/v2.9.0',
      body: 'Big new update',
      published_at: '2026-10-18T10:00:00Z',
      draft: false,
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockRelease,
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await checkForUpdate();
    expect(fetchMock).toHaveBeenCalled();
    expect(res.status).toBe('update-available');
    if (res.status === 'update-available') {
      expect(res.release.tagName).toBe('v2.9.0');
      expect(res.release.version).toBe('2.9.0');
    }
  });

  it('falls back gracefully to error when fetch fails and no cache exists', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('Network error'));
    vi.stubGlobal('fetch', fetchMock);

    const res = await checkForUpdate();
    expect(res.status).toBe('error');
    if (res.status === 'error') {
      expect(res.message).toBe('Network error');
    }
  });

  it('resolves current app version correctly', () => {
    const version = getCurrentAppVersion();
    expect(typeof version).toBe('string');
    expect(version.length).toBeGreaterThan(0);
  });
});
