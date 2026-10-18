import { useCallback, useEffect, useState } from 'react';
import {
  checkForUpdate,
  getCheckForUpdatesEnabled,
  getCurrentAppVersion,
  setDismissedUpdateVersion,
  setStoredCheckForUpdates,
  simulateRelease,
  type UpdateCheckResult,
} from '@/lib/update-check';
import { DEMO_PREVIEW_STORAGE_KEY, UPDATE_CHECK_INTERVAL_MS } from '@/lib/constants';

// Hook orchestrating background update checking, interval scheduling, manual checks,
// and dismiss state for the update notice and settings views. (How / Why / What)
export function useUpdateCheck() {
  const [result, setResult] = useState<UpdateCheckResult | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [checkForUpdates, setCheckForUpdatesState] = useState(() => getCheckForUpdatesEnabled());

  const check = useCallback(async (options?: { force?: boolean }) => {
    setIsChecking(true);
    try {
      const res = await checkForUpdate(options);
      setResult(res);
      return res;
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    void check();

    // Check periodically on the 6-hour interval
    const interval = setInterval(() => {
      void check();
    }, UPDATE_CHECK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [check]);

  const dismiss = useCallback(
    (tagName?: string) => {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(DEMO_PREVIEW_STORAGE_KEY);
      }
      if (result && result.status === 'update-available') {
        const tag = tagName || result.release.tagName;
        setDismissedUpdateVersion(tag);
        setResult({
          status: 'up-to-date',
          currentVersion: result.currentVersion,
          latestVersion: result.release.version,
        });
      }
    },
    [result],
  );

  const previewUpdate = useCallback(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(DEMO_PREVIEW_STORAGE_KEY, 'true');
    }
    const mock = simulateRelease();
    setResult({ status: 'update-available', release: mock, currentVersion: getCurrentAppVersion() });
  }, []);

  const toggleCheckForUpdates = useCallback(
    (enabled: boolean) => {
      setStoredCheckForUpdates(enabled);
      setCheckForUpdatesState(enabled);
      if (!enabled) {
        setResult({ status: 'disabled' });
      } else {
        void check({ force: true });
      }
    },
    [check],
  );

  return {
    result,
    isChecking,
    updateAvailable: result?.status === 'update-available',
    release: result?.status === 'update-available' ? result.release : null,
    currentVersion: result && 'currentVersion' in result ? result.currentVersion : getCurrentAppVersion(),
    dismissUpdate: dismiss,
    previewUpdate,
    checkNow: () => check({ force: true }),
    checkForUpdatesEnabled: checkForUpdates,
    setCheckForUpdatesEnabled: toggleCheckForUpdates,
  };
}
