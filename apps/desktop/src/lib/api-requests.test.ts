import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CancelRequest, PreviewRows, RunQuery } from '../../wailsjs/go/api/SqlService';
import {
  FindMongoDocuments,
  AggregateMongoDocuments,
  RunMongoCommandWithRequest,
} from '../../wailsjs/go/api/MongoService';
import { GetRedisKeyWithRequest, RunRedisCommandWithRequest, ScanRedisKeys } from '../../wailsjs/go/api/RedisService';
import { api } from './api';
import { QUERY_KEYS } from './query-keys';

vi.mock('../../wailsjs/go/api/SqlService', async (original) => ({
  ...(await original<typeof import('../../wailsjs/go/api/SqlService')>()),
  CancelRequest: vi.fn(),
  PreviewRows: vi.fn(),
  RunQuery: vi.fn(),
}));
vi.mock('../../wailsjs/go/api/MongoService', async (original) => ({
  ...(await original<typeof import('../../wailsjs/go/api/MongoService')>()),
  FindMongoDocuments: vi.fn(),
  AggregateMongoDocuments: vi.fn(),
  RunMongoCommandWithRequest: vi.fn(),
}));
vi.mock('../../wailsjs/go/api/RedisService', async (original) => ({
  ...(await original<typeof import('../../wailsjs/go/api/RedisService')>()),
  GetRedisKeyWithRequest: vi.fn(),
  RunRedisCommandWithRequest: vi.fn(),
  ScanRedisKeys: vi.fn(),
}));

describe('managed GUI API requests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(CancelRequest).mockResolvedValue(true);
  });

  it('adds an ID only at the binding boundary, preserving the input and stable preview key', async () => {
    const input = { tableId: 'users', limit: 50 };
    const key = QUERY_KEYS.PREVIEW('connection', input);
    await api.previewRows('connection', input);
    expect(PreviewRows).toHaveBeenCalledWith('connection', { ...input, requestId: expect.any(String) });
    expect(input).not.toHaveProperty('requestId');
    expect(QUERY_KEYS.PREVIEW('connection', input)).toEqual(key);
  });

  it('passes structured Mongo arguments without rewriting commands or pipelines', async () => {
    const find = { collection: 'items', filter: { active: true } };
    const aggregate = { collection: 'items', pipeline: [{ $limit: 7 }], skip: 2, limit: 3 };
    const command = { insert: 'items', documents: [{ value: 1 }] };
    await api.findMongoDocuments('connection', find);
    await api.aggregateMongoDocuments('connection', aggregate);
    await api.runMongoCommand('connection', 'db', command);
    expect(FindMongoDocuments).toHaveBeenCalledWith('connection', { ...find, requestId: expect.any(String) });
    expect(AggregateMongoDocuments).toHaveBeenCalledWith('connection', { ...aggregate, requestId: expect.any(String) });
    expect(RunMongoCommandWithRequest).toHaveBeenCalledExactlyOnceWith('connection', {
      database: 'db',
      command,
      requestId: expect.any(String),
    });
  });

  it('uses the controlled Redis companions and preserves exact command text', async () => {
    await api.getRedisKey('connection', 'key');
    await api.runRedisCommand('connection', 'INCR counter');
    await api.scanRedisKeys('connection', { pattern: 'a*', cursor: 0 });
    expect(GetRedisKeyWithRequest).toHaveBeenCalledWith('connection', { key: 'key', requestId: expect.any(String) });
    expect(RunRedisCommandWithRequest).toHaveBeenCalledExactlyOnceWith('connection', {
      command: 'INCR counter',
      requestId: expect.any(String),
    });
    expect(ScanRedisKeys).toHaveBeenCalledWith('connection', {
      pattern: 'a*',
      cursor: 0,
      requestId: expect.any(String),
    });
  });

  it('executes no command for an already closed owner', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      api.runQuery('connection', 'INSERT INTO items VALUES (1)', undefined, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(RunQuery).not.toHaveBeenCalled();
  });
});
