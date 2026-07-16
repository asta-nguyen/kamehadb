import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ErrorState } from '../error-state';

describe('ErrorState', () => {
  it('renders an alert with the error message', () => {
    const html = renderToStaticMarkup(<ErrorState error={new Error('Connection failed')} />);

    expect(html).toContain('role="alert"');
    expect(html).toContain('Connection failed');
  });

  it('renders the retry action when provided', () => {
    expect(renderToStaticMarkup(<ErrorState error="Failed" onRetry={() => undefined} />)).toContain('Retry');
  });

  it('uses a safe fallback for unknown errors', () => {
    expect(renderToStaticMarkup(<ErrorState error={{ reason: 'unknown' }} />)).toContain('Failed to load');
  });
});
