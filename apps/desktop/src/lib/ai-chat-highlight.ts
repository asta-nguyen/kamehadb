import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import sql from 'highlight.js/lib/languages/sql';
import type { CodeLanguage } from './ai-chat-helpers';

hljs.registerLanguage('sql', sql);
hljs.registerLanguage('javascript', javascript);

type HighlightEmitterNode = string | { scope?: unknown; children?: HighlightEmitterNode[] };

type HighlightEmitter = {
  root?: { children?: HighlightEmitterNode[] };
};

export type SafeHighlightNode =
  | { type: 'text'; value: string }
  | { type: 'element'; className: string; children: SafeHighlightNode[] };

const HIGHLIGHT_CLASS_PREFIX = 'hljs-';
const SAFE_CLASS_NAME_RE = /[^a-z0-9_-]/gi;

/**
 * Convert highlight.js scopes into the CSS classes our chat panel styles.
 * The sanitizer strips anything outside a conservative class-name charset so
 * the render path never trusts arbitrary scope text from a highlighter plugin.
 */
export function toSafeHighlightClassName(scope: string): string | null {
  const sanitizeToken = (value: string): string => value.replace(SAFE_CLASS_NAME_RE, '');

  if (scope.startsWith('language:')) {
    const languageName = sanitizeToken(scope.slice('language:'.length));
    return languageName ? `language-${languageName}` : null;
  }

  if (scope.includes('.')) {
    const parts = scope.split('.').map(sanitizeToken).filter(Boolean);
    if (parts.length === 0) return null;
    const [head, ...tail] = parts;
    return [`${HIGHLIGHT_CLASS_PREFIX}${head}`, ...tail.map((part, index) => `${part}${'_'.repeat(index + 1)}`)].join(
      ' ',
    );
  }

  const sanitizedScope = sanitizeToken(scope);
  return sanitizedScope ? `${HIGHLIGHT_CLASS_PREFIX}${sanitizedScope}` : null;
}

/**
 * Walk highlight.js's internal token tree instead of reparsing HTML.
 * This keeps all code content as text nodes and only re-emits sanitized class
 * names for syntax scopes we explicitly allow through the renderer.
 */
function sanitizeHighlightNodes(nodes: HighlightEmitterNode[]): SafeHighlightNode[] {
  return nodes.flatMap((node): SafeHighlightNode[] => {
    if (typeof node === 'string') return node ? [{ type: 'text', value: node }] : [];
    if (!Array.isArray(node.children)) return [];

    const children = sanitizeHighlightNodes(node.children);
    if (children.length === 0) return [];

    if (typeof node.scope !== 'string') return children;

    const className = toSafeHighlightClassName(node.scope);
    if (!className) return children;

    return [{ type: 'element', className, children }];
  });
}

/**
 * Build a safe render tree for highlighted code.
 * JSON and Redis stay as plain text because the chat panel only styles SQL and
 * JavaScript today; that avoids needless HTML generation for unhighlighted code.
 */
export function buildHighlightedCodeTree(code: string, language: CodeLanguage): SafeHighlightNode[] {
  if (language === 'redis' || language === 'json') {
    return [{ type: 'text', value: code }];
  }

  const result = hljs.highlight(code, { language });
  const emitter = result._emitter as HighlightEmitter;
  const children = Array.isArray(emitter.root?.children) ? sanitizeHighlightNodes(emitter.root.children) : [];
  return children.length > 0 ? children : [{ type: 'text', value: code }];
}
