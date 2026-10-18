import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UpdateSettingsSection } from './update-settings-section';

const hooks = vi.hoisted(() => ({
  useUpdateCheck: vi.fn(),
}));

vi.mock('@/hooks/use-update-check', () => ({
  useUpdateCheck: hooks.useUpdateCheck,
}));

describe('UpdateSettingsSection', () => {
  beforeEach(() => {
    hooks.useUpdateCheck.mockReturnValue({
      result: null,
      isChecking: false,
      updateAvailable: false,
      release: null,
      currentVersion: '2.0.3',
      dismissUpdate: vi.fn(),
      previewUpdate: vi.fn(),
      checkNow: vi.fn(),
      checkForUpdatesEnabled: true,
      setCheckForUpdatesEnabled: vi.fn(),
    });
  });

  it('renders automatic update toggle and current version', () => {
    const html = renderToStaticMarkup(<UpdateSettingsSection />);
    expect(html).toContain('Check for updates automatically');
    expect(html).toContain('Current version:');
    expect(html).toContain('2.0.3');
    expect(html).toContain('Check for updates');
  });
});
