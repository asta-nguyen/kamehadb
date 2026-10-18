import { describe, expect, it } from 'vitest';
import { getIndicatorColor } from './sidebar.helpers';
import type { ConnectionProfile } from '@kamehadb/shared';

describe('getIndicatorColor', () => {
  it('falls back to the status color while the connection profile is loading', () => {
    expect(getIndicatorColor(undefined, 'connected')).toBe('var(--success)');
  });

  it('always uses success color when connected even if connection profile defines a custom color', () => {
    const conn = { id: 'ch', name: 'ClickHouse', kind: 'clickhouse', color: '#ec4899' } as ConnectionProfile;
    expect(getIndicatorColor(conn, 'connected')).toBe('var(--success)');
  });

  it('uses warning for slow and reconnecting, destructive for disconnected', () => {
    expect(getIndicatorColor(undefined, 'slow')).toBe('var(--warning)');
    expect(getIndicatorColor(undefined, 'reconnecting')).toBe('var(--warning)');
    expect(getIndicatorColor(undefined, 'disconnected')).toBe('var(--destructive)');
  });
});
