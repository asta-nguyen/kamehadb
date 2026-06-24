/**
 * SQL identifier escaping utilities.
 *
 * Each database engine has its own quoting rules for identifiers (table names,
 * column names, etc.). These helpers centralize the per-dialect logic so
 * adapter files don't each define their own `escapeId` function.
 */

/** Escape an identifier by wrapping it in `char` and doubling any embedded `char`. */
function escapeWithChar(id: string, char: string): string {
  const doubled = char + char;
  return char + id.split(char).join(doubled) + char;
}

/** Escape an identifier by wrapping it in `[` `]` and doubling any embedded `]`. */
function escapeWithBrackets(id: string): string {
  return '[' + id.replace(/\]/g, ']]') + ']';
}

/** Escape an identifier by wrapping it in backticks and backslash-escaping embedded backticks. */
function escapeWithBacktickBackslash(id: string): string {
  return '`' + id.replace(/`/g, '\\`') + '`';
}

/** Per-dialect escape functions keyed by the shared DIALECT constant. */
export const ESCAPE_ID = {
  doubleQuote: (id: string): string => escapeWithChar(id, '"'),
  backtickDouble: (id: string): string => escapeWithChar(id, '`'),
  backtickBackslash: (id: string): string => escapeWithBacktickBackslash(id),
  brackets: (id: string): string => escapeWithBrackets(id),
} as const;
