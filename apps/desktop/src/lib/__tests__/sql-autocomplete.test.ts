import { describe, it, expect } from 'vitest';
import { buildSqlCompletionEntries, type CompletionsData, type CompletionEntry } from '../sql-autocomplete';

function makeTable(overrides: Partial<CompletionsData['tables'][0]> = {}): CompletionsData['tables'][0] {
  return {
    name: 'users',
    schema: 'public',
    columns: [
      { name: 'id', type: 'integer', primaryKey: true, foreignKey: undefined },
      { name: 'name', type: 'text', primaryKey: false, foreignKey: undefined },
      { name: 'email', type: 'text', primaryKey: false, foreignKey: undefined },
      {
        name: 'org_id',
        type: 'integer',
        primaryKey: false,
        foreignKey: { table: 'organizations', column: 'id' },
      },
    ],
    ...overrides,
  };
}

function makeData(tables: CompletionsData['tables'] = []): CompletionsData {
  return { tables };
}

function findSuggestion(entries: CompletionEntry[], label: string): CompletionEntry | undefined {
  return entries.find((e) => e.label === label);
}

describe('buildSqlCompletionEntries', () => {
  const data = makeData([
    makeTable(),
    makeTable({
      name: 'organizations',
      columns: [
        { name: 'id', type: 'integer', primaryKey: true, foreignKey: undefined },
        { name: 'name', type: 'text', primaryKey: false, foreignKey: undefined },
      ],
    }),
    makeTable({
      name: 'posts',
      columns: [
        { name: 'id', type: 'integer', primaryKey: true, foreignKey: undefined },
        { name: 'title', type: 'text', primaryKey: false, foreignKey: undefined },
        {
          name: 'user_id',
          type: 'integer',
          primaryKey: false,
          foreignKey: { table: 'users', column: 'id' },
        },
      ],
    }),
  ]);

  it('returns keyword + table + column suggestions in general context', () => {
    const entries = buildSqlCompletionEntries('SELECT * ', 'SELECT * ', data);
    expect(entries.length).toBeGreaterThan(0);
    expect(findSuggestion(entries, 'SELECT')).toBeDefined();
    expect(findSuggestion(entries, 'public.users')).toBeDefined();
    expect(findSuggestion(entries, 'public.organizations')).toBeDefined();
    expect(findSuggestion(entries, 'public.posts')).toBeDefined();
  });

  it('returns table suggestions after FROM', () => {
    const entries = buildSqlCompletionEntries('SELECT * FROM ', 'SELECT * FROM ', data);
    expect(findSuggestion(entries, 'public.users')).toBeDefined();
    expect(findSuggestion(entries, 'public.organizations')).toBeDefined();
    expect(findSuggestion(entries, 'public.posts')).toBeDefined();
  });

  it('returns table + JOIN keywords after FROM', () => {
    const entries = buildSqlCompletionEntries('SELECT * FROM users ', 'SELECT * FROM users ', data);
    expect(findSuggestion(entries, 'public.users')).toBeDefined();
    const joins = entries.filter((e) => e.label.includes('JOIN'));
    expect(joins.length).toBeGreaterThan(0);
    expect(joins.every((j) => j.kind === 'keyword')).toBe(true);
  });

  it('returns column suggestions in SELECT context', () => {
    const entries = buildSqlCompletionEntries('SELECT  FROM public.users', 'SELECT ', data);
    const columns = entries.filter((e) => e.kind === 'column');
    expect(columns.length).toBeGreaterThan(0);
  });

  it('returns column suggestions after table. qualifier', () => {
    const entries = buildSqlCompletionEntries('SELECT public.users. ', 'SELECT public.users.', data);
    expect(findSuggestion(entries, 'id')).toBeDefined();
    expect(findSuggestion(entries, 'name')).toBeDefined();
    expect(findSuggestion(entries, 'email')).toBeDefined();
  });

  it('returns columns + operators in condition context', () => {
    const entries = buildSqlCompletionEntries('SELECT * FROM users WHERE ', 'SELECT * FROM users WHERE ', data);
    expect(entries.filter((e) => e.kind === 'column').length).toBeGreaterThan(0);
    expect(entries.filter((e) => e.kind === 'operator').length).toBeGreaterThan(0);
    expect(findSuggestion(entries, 'AND')).toBeDefined();
  });
});

describe('FK JOIN/ON suggestions', () => {
  const data = makeData([
    makeTable({
      name: 'users',
      columns: [
        { name: 'id', type: 'integer', primaryKey: true, foreignKey: undefined },
        { name: 'name', type: 'text', primaryKey: false, foreignKey: undefined },
      ],
    }),
    makeTable({
      name: 'posts',
      columns: [
        { name: 'id', type: 'integer', primaryKey: true, foreignKey: undefined },
        { name: 'title', type: 'text', primaryKey: false, foreignKey: undefined },
        {
          name: 'user_id',
          type: 'integer',
          primaryKey: false,
          foreignKey: { table: 'users', column: 'id' },
        },
      ],
    }),
    makeTable({
      name: 'organizations',
      columns: [
        { name: 'id', type: 'integer', primaryKey: true, foreignKey: undefined },
        {
          name: 'user_id',
          type: 'integer',
          primaryKey: false,
          foreignKey: { table: 'users', column: 'id' },
        },
      ],
    }),
  ]);

  it('does not suggest FK conditions before ON keyword', () => {
    const entries = buildSqlCompletionEntries(
      'SELECT * FROM public.users JOIN public.posts ',
      'SELECT * FROM public.users JOIN public.posts ',
      data,
    );
    const fkConditions = entries.filter((e) => e.detail === 'FK condition');
    expect(fkConditions).toHaveLength(0);
  });

  it('suggests FK condition when typing after ON', () => {
    const sql = 'SELECT * FROM public.users JOIN public.posts ON ';
    const entries = buildSqlCompletionEntries(sql, sql, data);
    expect(findSuggestion(entries, 'posts.user_id = users.id')).toBeDefined();
  });

  it('suggests FK condition matching the last joined table', () => {
    const sql = 'SELECT * FROM public.users JOIN public.organizations ON ';
    const entries = buildSqlCompletionEntries(sql, sql, data);
    expect(findSuggestion(entries, 'organizations.user_id = users.id')).toBeDefined();
  });

  it('includes column + operator suggestions alongside FK conditions', () => {
    const sql = 'SELECT * FROM public.users JOIN public.posts ON ';
    const entries = buildSqlCompletionEntries(sql, sql, data);
    expect(entries.filter((e) => e.kind === 'column').length).toBeGreaterThan(0);
    expect(entries.filter((e) => e.kind === 'operator').length).toBeGreaterThan(0);
  });

  it('prioritizes PK column as the referenced target', () => {
    const sql = 'SELECT * FROM public.users JOIN public.posts ON ';
    const entries = buildSqlCompletionEntries(sql, sql, data);
    const fk = findSuggestion(entries, 'posts.user_id = users.id');
    expect(fk).toBeDefined();
    expect(fk!.detail).toBe('FK condition');
    expect(fk!.kind).toBe('operator');
  });
});
