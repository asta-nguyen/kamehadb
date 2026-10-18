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

  it('passes Mongo arguments without rewriting them and sends order-sensitive parts as JSON text', async () => {
    const find = { collection: 'items', filter: { active: true } };
    const aggregate = { collection: 'items', pipeline: [{ $limit: 7 }], skip: 2, limit: 3 };
    const command = { insert: 'items', documents: [{ value: 1 }] };
    await api.findMongoDocuments('connection', find);
    await api.aggregateMongoDocuments('connection', aggregate);
    await api.runMongoCommand('connection', 'db', command);
    // No sort means no sortJson, so a plain find is sent exactly as before.
    expect(FindMongoDocuments).toHaveBeenCalledWith('connection', { ...find, requestId: expect.any(String) });
    expect(AggregateMongoDocuments).toHaveBeenCalledWith('connection', {
      collection: 'items',
      skip: 2,
      limit: 3,
      pipelineJson: '[{"$limit":7}]',
      requestId: expect.any(String),
    });
    expect(RunMongoCommandWithRequest).toHaveBeenCalledExactlyOnceWith('connection', {
      database: 'db',
      commandJson: '{"insert":"items","documents":[{"value":1}]}',
      requestId: expect.any(String),
    });
  });

  // A Go map would reorder these keys; the JSON text must keep them as written.
  it('keeps the key order of compound sorts, pipeline stages and commands', async () => {
    await api.findMongoDocuments('connection', { collection: 'items', sort: { score: -1, name: 1, age: 1 } });
    await api.aggregateMongoDocuments('connection', {
      collection: 'items',
      pipeline: [{ $sort: { score: -1, name: 1 } }, { $match: { tags: { $in: [] } } }],
    });
    await api.runMongoCommand('connection', 'db', {
      createIndexes: 'items',
      indexes: [{ key: { b: -1, a: 1 }, name: 'b_a' }],
    });
    expect(FindMongoDocuments).toHaveBeenLastCalledWith('connection', {
      collection: 'items',
      sortJson: '{"score":-1,"name":1,"age":1}',
      requestId: expect.any(String),
    });
    expect(AggregateMongoDocuments).toHaveBeenLastCalledWith('connection', {
      collection: 'items',
      pipelineJson: '[{"$sort":{"score":-1,"name":1}},{"$match":{"tags":{"$in":[]}}}]',
      requestId: expect.any(String),
    });
    expect(RunMongoCommandWithRequest).toHaveBeenLastCalledWith('connection', {
      database: 'db',
      commandJson: '{"createIndexes":"items","indexes":[{"key":{"b":-1,"a":1},"name":"b_a"}]}',
      requestId: expect.any(String),
    });
  });

  it('omits sortJson for an empty sort', async () => {
    await api.findMongoDocuments('connection', { collection: 'items', sort: {} });
    expect(FindMongoDocuments).toHaveBeenLastCalledWith('connection', {
      collection: 'items',
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
