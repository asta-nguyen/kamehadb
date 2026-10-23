import { describe, expect, it } from 'vitest';
import type { ColumnInfo, QueryColumn } from '@kamehadb/shared';
import { buildRowUpdateQuery, getQueryResultEditabilityState } from './table-editability';

const usersColumns: ColumnInfo[] = [
  { name: 'id', type: 'integer', nullable: false, default: null, primaryKey: true },
  { name: 'name', type: 'text', nullable: true, default: null, primaryKey: false },
];

const resultColumns: QueryColumn[] = [
  { name: 'id', type: 'integer' },
  { name: 'name', type: 'text' },
];

describe('getQueryResultEditabilityState', () => {
  it('keeps cells non-editable with a read-only warning while the profile is read-only', () => {
    const state = getQueryResultEditabilityState({
      querySql: 'SELECT id, name FROM users',
      resultColumns,
      tableColumns: usersColumns,
      isReadOnly: true,
    });
    expect(state.canEditCells).toBe(false);
    expect(state.tableId).toBeNull();
    expect(state.warningMessage).toContain('read-only');
    expect(state.warningTone).toBe('warning');
  });

  it('allows cell edits on a writable profile for a direct single-table select', () => {
    const state = getQueryResultEditabilityState({
      querySql: 'SELECT id, name FROM users',
      resultColumns,
      tableColumns: usersColumns,
      isReadOnly: false,
    });
    expect(state.canEditCells).toBe(true);
    expect(state.tableId).toBe('users');
  });

  it('still rejects non-direct query shapes on a writable profile', () => {
    const state = getQueryResultEditabilityState({
      querySql: 'SELECT u.id FROM users u JOIN orders o ON o.user_id = u.id',
      resultColumns,
      tableColumns: usersColumns,
      isReadOnly: false,
    });
    expect(state.canEditCells).toBe(false);
    expect(state.tableId).toBeNull();
    expect(state.warningMessage).toContain('Only direct single-table');
  });
});

describe('buildRowUpdateQuery', () => {
  it('generates standard SQL TRUE/FALSE for boolean columns', () => {
    const sqlTrue = buildRowUpdateQuery({
      tableId: 'users',
      row: { id: 1, is_active: false },
      column: 'is_active',
      newValue: 'true',
      columnType: 'boolean',
      pkColumns: ['id'],
      allColumnNames: ['id', 'is_active'],
      dateColumns: new Set(),
    });
    expect(sqlTrue).toContain('"is_active" = TRUE');

    const sqlFalse = buildRowUpdateQuery({
      tableId: 'users',
      row: { id: 1, is_active: true },
      column: 'is_active',
      newValue: 'false',
      columnType: 'bool',
      pkColumns: ['id'],
      allColumnNames: ['id', 'is_active'],
      dateColumns: new Set(),
    });
    expect(sqlFalse).toContain('"is_active" = FALSE');
  });

  it('generates standard SQL TRUE/FALSE when row value is boolean even if columnType is undefined', () => {
    const sql = buildRowUpdateQuery({
      tableId: 'users',
      row: { id: 1, is_active: true },
      column: 'is_active',
      newValue: 'false',
      pkColumns: ['id'],
      allColumnNames: ['id', 'is_active'],
      dateColumns: new Set(),
    });
    expect(sql).toContain('"is_active" = FALSE');
  });

  it('generates NULL when newValue is empty string', () => {
    const sql = buildRowUpdateQuery({
      tableId: 'users',
      row: { id: 1, name: 'Alice' },
      column: 'name',
      newValue: '',
      pkColumns: ['id'],
      allColumnNames: ['id', 'name'],
      dateColumns: new Set(),
    });
    expect(sql).toContain('"name" = NULL');
  });
});
