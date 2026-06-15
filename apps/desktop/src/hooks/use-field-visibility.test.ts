import { describe, expect, it } from 'vitest';
import { collectRecordFields, resolveVisibleFields, toggleHiddenField } from './use-field-visibility';

describe('field visibility', () => {
  it('shows newly discovered fields unless the user explicitly hid them', () => {
    const hiddenFields = toggleHiddenField(['id', 'name'], [], 'name', false);

    expect(resolveVisibleFields(['id', 'name', 'email'], hiddenFields)).toEqual(['id', 'email']);
  });

  it('does not hide the final visible field', () => {
    expect(toggleHiddenField(['id'], [], 'id', false)).toEqual([]);
  });

  it('collects sparse Mongo fields from every document', () => {
    expect(
      collectRecordFields([
        { _id: 1, name: 'Ada' },
        { _id: 2, email: 'ada@example.com' },
      ]),
    ).toEqual(['_id', 'name', 'email']);
  });
});
