import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EmptyState } from '../empty-state';

describe('EmptyState', () => {
  it('renders its title, description, and action', () => {
    const html = renderToStaticMarkup(
      <EmptyState title="No documents" description="Change the filter" action={<span>Clear filter</span>} />,
    );

    expect(html).toContain('No documents');
    expect(html).toContain('Change the filter');
    expect(html).toContain('Clear filter');
  });

  it('renders the compact spacing variant', () => {
    expect(renderToStaticMarkup(<EmptyState title="Empty" compact />)).toContain('py-2');
  });
});
