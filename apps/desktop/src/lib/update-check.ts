import {
  GITHUB_RELEASES_API_URL,
  UPDATE_CACHE_STORAGE_KEY,
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_CHECK_TIMEOUT_MS,
  UPDATE_DISMISSED_VERSION_KEY,
  UPDATE_SETTINGS_STORAGE_KEY,
  DEMO_PREVIEW_STORAGE_KEY,
} from './constants';

export type ReleaseInfo = {
  version: string;
  tagName: string;
  name: string;
  htmlUrl: string;
  body: string;
  publishedAt: string;
  checkedAt: number;
};

export type UpdateCheckResult =
  | { status: 'update-available'; release: ReleaseInfo; currentVersion: string }
  | { status: 'up-to-date'; currentVersion: string; latestVersion: string }
  | { status: 'disabled' }
  | { status: 'error'; message: string };

export type SemVer = {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
};

export const DEFAULT_APP_VERSION = '2.0.3';

// Parse a semantic version string (e.g. "v2.0.1", "2.0.3", "v2.0.1-7-g5707e50") into
// numeric major, minor, patch and optional prerelease identifier. (How / Why / What)
export function parseSemVer(versionStr: string): SemVer | null {
  if (!versionStr || typeof versionStr !== 'string') return null;
  const clean = versionStr.trim().replace(/^[vV]/, '');
  const match = clean.match(/^(\d+)\.(\d+)(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?/);
  if (!match) return null;
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: match[3] ? parseInt(match[3], 10) : 0,
    prerelease: match[4],
  };
}

// Compare two version strings to determine if remote is strictly newer than current.
// Compares major, minor, patch numbers in order, then handles pre-release tags. (How / Why / What)
export function isNewerVersion(remoteStr: string, currentStr: string): boolean {
  const remote = parseSemVer(remoteStr);
  const current = parseSemVer(currentStr);
  if (!remote) return false;
  if (!current) return true;

  if (remote.major !== current.major) {
    return remote.major > current.major;
  }
  if (remote.minor !== current.minor) {
    return remote.minor > current.minor;
  }
  if (remote.patch !== current.patch) {
    return remote.patch > current.patch;
  }

  // If base versions are equal: a formal release without prerelease is newer than a prerelease/dev build
  if (!remote.prerelease && current.prerelease) {
    return true;
  }

  return false;
}

// Resolve the active app version, picking the higher of git tag or package version so
// working tree dev builds never mistakenly report an older release as new. (How / Why / What)
export function getCurrentAppVersion(): string {
  if (typeof __APP_VERSION__ !== 'undefined' && __APP_VERSION__ && __APP_VERSION__ !== 'dev') {
    const gitVer = parseSemVer(__APP_VERSION__);
    const pkgVer = parseSemVer(DEFAULT_APP_VERSION);
    if (gitVer && pkgVer && isNewerVersion(DEFAULT_APP_VERSION, __APP_VERSION__)) {
      return DEFAULT_APP_VERSION;
    }
    return __APP_VERSION__;
  }
  return DEFAULT_APP_VERSION;
}

export function getCheckForUpdatesEnabled(): boolean {
  try {
    if (typeof localStorage === 'undefined') return true;
    const item = localStorage.getItem(UPDATE_SETTINGS_STORAGE_KEY);
    return item === null ? true : item === 'true';
  } catch {
    return true;
  }
}

export function setStoredCheckForUpdates(enabled: boolean): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(UPDATE_SETTINGS_STORAGE_KEY, String(enabled));
    }
  } catch {
    // LocalStorage quota or access denied in sandbox
  }
}

export function getCachedReleaseInfo(): ReleaseInfo | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(UPDATE_CACHE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && 'version' in parsed && 'tagName' in parsed && 'checkedAt' in parsed) {
      return parsed as ReleaseInfo;
    }
  } catch {
    // Corrupt cache
  }
  return null;
}

export function setCachedReleaseInfo(info: ReleaseInfo): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(UPDATE_CACHE_STORAGE_KEY, JSON.stringify(info));
    }
  } catch {
    // Storage error
  }
}

export function getDismissedUpdateVersion(): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(UPDATE_DISMISSED_VERSION_KEY);
  } catch {
    return null;
  }
}

export function setDismissedUpdateVersion(tagName: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(UPDATE_DISMISSED_VERSION_KEY, tagName);
    }
  } catch {
    // Storage error
  }
}

// Generate sample release metadata for simulating update notices in tests and UI previews. (How / Why / What)
export function simulateRelease(): ReleaseInfo {
  return {
    version: '2.0.4',
    tagName: 'v2.0.4',
    name: 'KamehaDB v2.0.4',
    htmlUrl: 'https://github.com/asta-nguyen/kamehadb/releases/tag/v2.0.4',
    body: `### What's New in v2.0.4\n- **Automatic Update Checker**: Live background notifications for new releases with 6-hour caching.\n- **Sidebar Notice**: Compact status bar with glowing dot and download icon.\n- **Settings Controls**: Opt-out toggle in Settings → Updates with manual check.\n- **Performance**: Faster tab switching and reduced memory footprint.`,
    publishedAt: new Date().toISOString(),
    checkedAt: Date.now(),
  };
}

// Check for updates against GitHub Releases API with 6-hour caching and timeout.
// Honors the check_for_updates setting unless force is requested. (How / Why / What)
export async function checkForUpdate(options?: { force?: boolean }): Promise<UpdateCheckResult> {
  const isEnabled = getCheckForUpdatesEnabled();
  if (!isEnabled && !options?.force) {
    return { status: 'disabled' };
  }

  const currentVersion = getCurrentAppVersion();
  const cached = getCachedReleaseInfo();
  const dismissed = getDismissedUpdateVersion();
  const now = Date.now();

  // If a preview simulation is explicitly active, return the simulated release unless dismissed. (Why)
  if (typeof localStorage !== 'undefined' && localStorage.getItem(DEMO_PREVIEW_STORAGE_KEY) === 'true') {
    if (dismissed !== 'v2.0.4' || options?.force) {
      const mock = simulateRelease();
      return { status: 'update-available', release: mock, currentVersion };
    }
  }

  // If cache is fresh and not forcing, use the cached release metadata.
  if (!options?.force && cached && now - cached.checkedAt < UPDATE_CHECK_INTERVAL_MS) {
    if (isNewerVersion(cached.version, currentVersion)) {
      if (cached.tagName !== dismissed) {
        return { status: 'update-available', release: cached, currentVersion };
      }
    }
    return { status: 'up-to-date', currentVersion, latestVersion: cached.version };
  }

  // Fetch latest release from GitHub API with an abort timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPDATE_CHECK_TIMEOUT_MS);

  try {
    const response = await fetch(GITHUB_RELEASES_API_URL, {
      signal: controller.signal,
      headers: {
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      // If cached data exists on HTTP error, fall back to cached data
      if (cached) {
        if (isNewerVersion(cached.version, currentVersion) && cached.tagName !== dismissed) {
          return { status: 'update-available', release: cached, currentVersion };
        }
        return { status: 'up-to-date', currentVersion, latestVersion: cached.version };
      }
      return { status: 'error', message: `HTTP ${response.status}: ${response.statusText}` };
    }

    const data = (await response.json()) as {
      tag_name: string;
      name?: string;
      html_url: string;
      body?: string;
      published_at: string;
      draft?: boolean;
    };

    if (data.draft) {
      return { status: 'up-to-date', currentVersion, latestVersion: currentVersion };
    }

    const tagName = data.tag_name || '';
    const cleanVer = tagName.replace(/^[vV]/, '');
    const release: ReleaseInfo = {
      version: cleanVer,
      tagName,
      name: data.name || tagName,
      htmlUrl: data.html_url,
      body: data.body || '',
      publishedAt: data.published_at || new Date().toISOString(),
      checkedAt: Date.now(),
    };

    setCachedReleaseInfo(release);

    if (isNewerVersion(release.version, currentVersion)) {
      if (release.tagName !== dismissed || options?.force) {
        return { status: 'update-available', release, currentVersion };
      }
    }

    return { status: 'up-to-date', currentVersion, latestVersion: release.version };
  } catch (err: unknown) {
    // If request fails (offline, rate limited, timeout), fallback to cache if available
    if (cached) {
      if (isNewerVersion(cached.version, currentVersion) && cached.tagName !== dismissed) {
        return { status: 'update-available', release: cached, currentVersion };
      }
      return { status: 'up-to-date', currentVersion, latestVersion: cached.version };
    }
    const message = err instanceof Error ? err.message : 'Failed to check for updates';
    return { status: 'error', message };
  } finally {
    clearTimeout(timeoutId);
  }
}
