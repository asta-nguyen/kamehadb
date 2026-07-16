import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ExplorerToolbar } from '../explorer-toolbar';

describe('ExplorerToolbar', () => {
  it('renders title, count, search, actions, and refresh controls', () => {
    const html = renderToStaticMarkup(
      <ExplorerToolbar
        title="Documents"
        count={12}
        searchValue="Ada"
        onSearchChange={() => undefined}
        actions={<span>Export</span>}
        onRefresh={() => undefined}
      />,
    );

    expect(html).toContain('Documents');
    expect(html).toContain('12');
    expect(html).toContain('value="Ada"');
    expect(html).toContain('Export');
    expect(html).toContain('title="Refresh"');
  });

  it('omits search when it is not configured', () => {
    expect(renderToStaticMarkup(<ExplorerToolbar title="Documents" />)).not.toContain('placeholder="Filter..."');
  });
});
