import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SaveQueryHistory } from '../../wailsjs/go/api/QueryHistoryService';
import { api } from './api';
import { PickSaveFile } from '../../wailsjs/go/main/App';
import { ExportQueryCSV, CancelExport } from '../../wailsjs/go/api/SqlService';

vi.mock('../../wailsjs/go/api/QueryHistoryService', () => ({
  SaveQueryHistory: vi.fn(),
  GetQueryHistory: vi.fn(),
  UpdateQueryHistory: vi.fn(),
  DeleteQueryHistory: vi.fn(),
}));

vi.mock('../../wailsjs/go/main/App', () => ({ PickSaveFile: vi.fn() }));
vi.mock('../../wailsjs/go/api/SqlService', async (original) => ({
  ...(await original<typeof import('../../wailsjs/go/api/SqlService')>()),
  ExportQueryCSV: vi.fn(),
  CancelExport: vi.fn(),
}));

describe('native CSV export Wails boundary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('executes no SQL when destination selection is cancelled', async () => {
    vi.mocked(PickSaveFile).mockResolvedValue('');
    expect(await api.exportQueryCSV('connection', { query: 'SELECT 1' }, 'id')).toBeNull();
    expect(ExportQueryCSV).not.toHaveBeenCalled();
  });

  it('passes the original query/params after selection and cancels by client ID', async () => {
    vi.mocked(PickSaveFile).mockResolvedValue('/private/result.csv');
    const input = { query: 'SELECT * FROM t WHERE id>$1 LIMIT 7', params: ['9007199254740993'] };
    const ready = vi.fn(() => true);
    await api.exportQueryCSV('connection', input, 'client-id', ready);
    expect(ready).toHaveBeenCalledOnce();
    expect(ExportQueryCSV).toHaveBeenCalledWith('connection', {
      ...input,
      id: 'client-id',
      path: '/private/result.csv',
    });
    await api.cancelExport('client-id');
    expect(CancelExport).toHaveBeenCalledWith('client-id');
  });

  it('does not export if its view closed while the dialog was open', async () => {
    vi.mocked(PickSaveFile).mockResolvedValue('/private/result.csv');
    expect(await api.exportQueryCSV('connection', { query: 'SELECT 1' }, 'id', () => false)).toBeNull();
    expect(ExportQueryCSV).not.toHaveBeenCalled();
  });
});

describe('query history Wails arguments', () => {
  beforeEach(() => vi.clearAllMocks());

  // SQL adapters report fractional milliseconds, but history's Go binding and
  // SQLite field expect integer milliseconds; normalize only at that boundary.
  it.each([
    { durationMs: 45.851, expected: 46 },
    { durationMs: 0.041, expected: 0 },
    { durationMs: 12, expected: 12 },
    { durationMs: 0, expected: 0 },
    { durationMs: undefined, expected: undefined },
  ])('sends $durationMs as $expected milliseconds', async ({ durationMs, expected }) => {
    const input = { query: 'SELECT 1', durationMs, rowCount: 1 };
    await api.saveQueryHistory('connection-1', input);

    expect(SaveQueryHistory).toHaveBeenCalledWith('connection-1', {
      query: 'SELECT 1',
      durationMs: expected,
      rowCount: 1,
    });
    expect(input.durationMs).toBe(durationMs);
  });
});
