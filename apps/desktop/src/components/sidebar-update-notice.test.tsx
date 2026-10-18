import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SidebarUpdateNotice } from './sidebar-update-notice';
import type { ReleaseInfo } from '@/lib/update-check';

describe('SidebarUpdateNotice', () => {
  const mockRelease: ReleaseInfo = {
    version: '2.5.0',
    tagName: 'v2.5.0',
    name: 'KamehaDB v2.5.0',
    htmlUrl: 'https://github.com/asta-nguyen/kamehadb/releases/tag/v2.5.0',
    body: '## Fixes\n- Awesome feature',
    publishedAt: '2026-10-18T00:00:00Z',
    checkedAt: Date.now(),
  };

  it('renders nothing when updateAvailable is false', () => {
    const html = renderToStaticMarkup(
      <SidebarUpdateNotice release={mockRelease} currentVersion="2.0.3" updateAvailable={false} onDismiss={vi.fn()} />,
    );
    expect(html).toBe('');
  });

  it('renders nothing when release is null', () => {
    const html = renderToStaticMarkup(
      <SidebarUpdateNotice release={null} currentVersion="2.0.3" updateAvailable={true} onDismiss={vi.fn()} />,
    );
    expect(html).toBe('');
  });

  it('renders sidebar-update with glowing dot and download icon when updateAvailable is true', () => {
    const html = renderToStaticMarkup(
      <SidebarUpdateNotice release={mockRelease} currentVersion="2.0.3" updateAvailable={true} onDismiss={vi.fn()} />,
    );

    // Verify sidebar-update requirements:
    // 1. data-slot="sidebar-update" and id="sidebar-update"
    expect(html).toContain('data-slot="sidebar-update"');
    expect(html).toContain('id="sidebar-update"');
    // 2. Tag name is displayed
    expect(html).toContain('v2.5.0');
    // 3. Update available label is displayed
    expect(html).toContain('Update available');
    // 4. Dot indicator (solid emerald dot)
    expect(html).toContain('bg-emerald-500');
    // 5. Dismiss button
    expect(html).toContain('Dismiss notice');
  });
});
