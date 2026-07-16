import { describe, expect, it } from 'vitest';
import { isQuerySafe } from '../../../../packages/shared/src/types';

describe('isQuerySafe', () => {
  it('only accepts single read-only statements', () => {
    expect(isQuerySafe('SELECT * FROM users').safe).toBe(true);
    expect(isQuerySafe('WITH active AS (SELECT 1) SELECT * FROM active').safe).toBe(true);
    expect(isQuerySafe('UPDATE users SET admin = true').safe).toBe(false);
    expect(isQuerySafe('CALL grant_admin()').safe).toBe(false);
    expect(isQuerySafe('SELECT 1; CALL grant_admin()').safe).toBe(false);
  });
});
