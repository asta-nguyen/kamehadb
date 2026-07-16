import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FilterBar } from '../filter-bar';

describe('FilterBar', () => {
  it('renders a configured filter and its value input', () => {
    const html = renderToStaticMarkup(
      <FilterBar
        filters={[{ column: 'name', operator: 'LIKE', value: 'Ada%' }]}
        columns={['name', 'id']}
        onChange={() => undefined}
      />,
    );

    expect(html).toContain('Ada%');
    expect(html).toContain('Remove filter');
    expect(html).toContain('Add filter');
  });

  it('hides the value input for null operators', () => {
    const html = renderToStaticMarkup(
      <FilterBar
        filters={[{ column: 'deleted_at', operator: 'IS NULL', value: '' }]}
        columns={['deleted_at']}
        onChange={() => undefined}
      />,
    );

    expect(html).not.toContain('placeholder="Value"');
  });

  it('disables adding a filter when no columns are available', () => {
    expect(renderToStaticMarkup(<FilterBar filters={[]} columns={[]} onChange={() => undefined} />)).toContain(
      'disabled=""',
    );
  });
});
