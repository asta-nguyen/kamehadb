import { describe, expect, it } from 'vitest';
import { isQuerySafe } from '../../../../packages/shared/src/types';

describe('isQuerySafe', () => {
  it('only accepts single read-only statements', () => {
    expect(isQuerySafe('SELECT * FROM users').safe).toBe(true);
    expect(isQuerySafe('WITH active AS (SELECT 1) SELECT * FROM active').safe).toBe(true);
    expect(isQuerySafe('UPDATE users SET admin = true').safe).toBe(false);
    expect(isQuerySafe('CALL grant_admin()').safe).toBe(false);
    expect(isQuerySafe('SELECT 1; CALL grant_admin()').safe).toBe(false);
    expect(isQuerySafe('SELECT * INTO copied FROM source').safe).toBe(false);
  });

  it('ignores destructive keywords inside string literals', () => {
    expect(isQuerySafe("SELECT 'DROP TABLE users' AS joke").safe).toBe(true);
    expect(isQuerySafe("SELECT 'DELETE FROM accounts' AS warning").safe).toBe(true);
    expect(isQuerySafe("SELECT * FROM users WHERE note = 'please UPDATE this'").safe).toBe(true);
  });

  it('ignores destructive keywords inside comments', () => {
    expect(isQuerySafe('SELECT 1 -- DROP TABLE users').safe).toBe(true);
    expect(isQuerySafe('/* DELETE everything */ SELECT * FROM users').safe).toBe(true);
  });

  it('ignores destructive keywords inside dollar-quoted strings', () => {
    expect(isQuerySafe('SELECT $$DROP TABLE users$$ AS body').safe).toBe(true);
    expect(isQuerySafe('SELECT $func$ UPDATE accounts SET balance = 0 $func$ AS body').safe).toBe(true);
  });

  it('still blocks real destructive statements with noise', () => {
    expect(isQuerySafe('DROP TABLE users -- just kidding').safe).toBe(false);
    expect(isQuerySafe('/* comment */ DELETE FROM users').safe).toBe(false);
    expect(isQuerySafe('SELECT 1; DROP TABLE users').safe).toBe(false);
  });
});
