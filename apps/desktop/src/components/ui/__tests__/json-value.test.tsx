import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { JsonValue } from '../json-value';

describe('JsonValue', () => {
  it('renders primitives and null values', () => {
    expect(renderToStaticMarkup(<JsonValue value={null} />)).toContain('null');
    expect(renderToStaticMarkup(<JsonValue value={42} />)).toContain('42');
    expect(renderToStaticMarkup(<JsonValue value="hello" />)).toContain('hello');
  });

  it('exposes expandable object semantics', () => {
    const html = renderToStaticMarkup(<JsonValue value={{ name: 'Ada', active: true }} />);

    expect(html).toContain('aria-label="Collapse object"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('name:');
  });

  it('limits large collections in the expanded preview', () => {
    const html = renderToStaticMarkup(<JsonValue value={Array.from({ length: 25 }, (_, index) => index)} />);

    expect(html).toContain('... and 5 more');
    expect(html).not.toContain('>24<');
  });

  it('respects maxExpandDepth for nested values', () => {
    const html = renderToStaticMarkup(<JsonValue value={{ nested: { value: 1 } }} maxExpandDepth={1} />);

    expect(html).toContain('aria-label="Expand object"');
    expect(html).toContain('aria-expanded="false"');
  });
});
