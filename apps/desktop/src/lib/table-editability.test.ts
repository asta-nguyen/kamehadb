import { describe, expect, it } from 'vitest';
import { buildRowUpdateQuery, getQueryResultEditabilityState } from './table-editability';

describe('getQueryResultEditabilityState', () => {
  it('marks results as read-only when isReadOnly is true', () => {
    const state = getQueryResultEditabilityState({
      querySql: 'SELECT * FROM users',
      resultColumns: [{ name: 'id', type: 'integer' }],
      tableColumns: [{ name: 'id', type: 'integer', primaryKey: true, nullable: false, default: null }],
      isReadOnly: true,
    });
    expect(state.canEditCells).toBe(false);
    expect(state.warningMessage).toBe('SQL query results are read-only.');
    expect(state.warningTone).toBe('info');
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
