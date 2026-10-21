import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { TableStats } from './table-stats';
import type { IndexStats, TableStats as TableStatsType } from '@kamehadb/shared';

const mockTableStats = vi.hoisted(() => vi.fn());
const mockIndexStats = vi.hoisted(() => vi.fn());
const mockTableIndexes = vi.hoisted(() => vi.fn<() => { data?: unknown[] }>(() => ({ data: [] })));

vi.mock('@/hooks/use-schema', () => ({
  useTableStats: () => mockTableStats(),
  useIndexStats: () => mockIndexStats(),
  useTableIndexes: () => mockTableIndexes(),
}));

const baseStats: TableStatsType = {
  tableId: 'public.large',
  name: 'large',
  schema: 'public',
  rowEstimate: 1000,
  totalBytes: 50000,
  indexesBytes: 10000,
  toastBytes: 0,
  bloatBytes: 0,
  bloatPercent: 0,
  lastVacuum: null,
  lastAutovacuum: null,
  lastAnalyze: null,
  lastAutoanalyze: null,
  vacuumCount: 0,
  autovacuumCount: 0,
  nLiveTup: 1000,
  nDeadTup: 0,
};

describe('TableStats index usage display', () => {
  it('renders scans and usage percent when index has scans > 0 (not "Unused")', () => {
    mockTableStats.mockReturnValue({ data: baseStats, isLoading: false, error: null });
    mockIndexStats.mockReturnValue({
      data: [
        {
          name: 'large_pkey',
          table: 'public.large',
          columns: ['id'],
          unique: true,
          primary: true,
          method: 'btree',
          sizeBytes: 16384,
          scans: 29,
          reads: 29,
          usagePercent: 100.0,
        } as IndexStats,
      ],
    });

    const html = renderToStaticMarkup(<TableStats connectionId="conn-1" tableId="public.large" />);
    expect(html).toContain('large_pkey');
    expect(html).toContain('29');
    expect(html).toContain('100.0%');
    expect(html).not.toContain('Unused');
  });

  it('renders "—" instead of "Unused" when all indexes have 0 scans (e.g. telemetry not available)', () => {
    mockTableStats.mockReturnValue({ data: baseStats, isLoading: false, error: null });
    mockIndexStats.mockReturnValue({
      data: [
        {
          name: 'large_pkey',
          table: 'public.large',
          columns: ['id'],
          unique: true,
          primary: true,
          method: 'btree',
          sizeBytes: 16384,
          scans: 0,
          reads: 0,
          usagePercent: 0,
        } as IndexStats,
        {
          name: 'large_idx',
          table: 'public.large',
          columns: ['created_at'],
          unique: false,
          primary: false,
          method: 'btree',
          sizeBytes: 16384,
          scans: 0,
          reads: 0,
          usagePercent: 0,
        } as IndexStats,
      ],
    });

    const html = renderToStaticMarkup(<TableStats connectionId="conn-1" tableId="public.large" />);
    expect(html).not.toContain('Unused');
    expect(html).toContain('—');
  });

  it('renders "Unused" only for 0-scan index when other indexes have scans', () => {
    mockTableStats.mockReturnValue({ data: baseStats, isLoading: false, error: null });
    mockIndexStats.mockReturnValue({
      data: [
        {
          name: 'large_pkey',
          table: 'public.large',
          columns: ['id'],
          unique: true,
          primary: true,
          method: 'btree',
          sizeBytes: 16384,
          scans: 50,
          reads: 50,
          usagePercent: 100.0,
        } as IndexStats,
        {
          name: 'large_unused_idx',
          table: 'public.large',
          columns: ['unused_col'],
          unique: false,
          primary: false,
          method: 'btree',
          sizeBytes: 8192,
          scans: 0,
          reads: 0,
          usagePercent: 0,
        } as IndexStats,
      ],
    });

    const html = renderToStaticMarkup(<TableStats connectionId="conn-1" tableId="public.large" />);
    expect(html).toContain('large_pkey');
    expect(html).toContain('100.0%');
    expect(html).toContain('large_unused_idx');
    expect(html).toContain('Unused');
  });

  it('renders index count from schema indexes when indexStats has no entries', () => {
    mockTableStats.mockReturnValue({ data: baseStats, isLoading: false, error: null });
    mockIndexStats.mockReturnValue({ data: [] });
    mockTableIndexes.mockReturnValue({
      data: [
        { name: 'idx_1', columns: ['id'], primary: true, unique: true },
        { name: 'idx_2', columns: ['name'], primary: false, unique: false },
      ],
    });

    const html = renderToStaticMarkup(<TableStats connectionId="conn-1" tableId="public.large" />);
    expect(html).toContain('2 indexes');
  });
});
