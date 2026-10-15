import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DataTable } from './data-table';

describe('DataTable empty state', () => {
  it('centers the placeholder on the table area instead of a left-pinned grid cell', () => {
    const html = renderToStaticMarkup(<DataTable rows={[]} columns={[]} rowKey={(_, i) => String(i)} />);

    expect(html).toContain('No data');
    expect(html).toContain('items-center justify-center');
    // The placeholder must not sit inside a grid row; a flex-row cell would left-align it.
    expect(html).not.toContain('data-slot="table-row"');
  });
});
