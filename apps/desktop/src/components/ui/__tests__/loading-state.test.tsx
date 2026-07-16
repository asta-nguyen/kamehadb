import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LoadingState } from '../loading-state';

describe('LoadingState', () => {
  it('announces loading to assistive technology', () => {
    const html = renderToStaticMarkup(<LoadingState />);

    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('Loading');
  });

  it('renders the compact spacing variant', () => {
    expect(renderToStaticMarkup(<LoadingState compact />)).toContain('py-2');
  });
});
