import { describe, expect, it } from 'vitest';
import { MCP_ERROR_CODE, toMcpToolError } from './errors.js';

describe('MCP database timeout errors', () => {
  it('maps native driver timeout codes to the stable query-timeout code', () => {
    const errors = [
      Object.assign(new Error('cancelled'), { code: '57014' }),
      Object.assign(new Error('timeout'), { code: 'ER_QUERY_TIMEOUT' }),
      Object.assign(new Error('timeout'), { code: 'ER_STATEMENT_TIMEOUT' }),
      Object.assign(new Error('timeout'), { errno: 3024 }),
      Object.assign(new Error('timeout'), { errno: 1969 }),
      Object.assign(new Error('timeout'), { code: 'ETIMEOUT' }),
      Object.assign(new Error('timeout'), { code: 50 }),
      Object.assign(new Error('timeout'), { codeName: 'MaxTimeMSExpired' }),
    ];

    for (const error of errors) {
      expect(toMcpToolError(error).code).toBe(MCP_ERROR_CODE.QUERY_TIMEOUT);
    }
  });
});
