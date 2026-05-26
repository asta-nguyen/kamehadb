const DESTRUCTIVE_KEYWORDS = [
  'DROP',
  'TRUNCATE',
  'ALTER',
  'CREATE',
  'INSERT',
  'UPDATE',
  'DELETE',
  'MERGE',
  'GRANT',
  'REVOKE',
];

const SAFE_KEYWORDS = ['SELECT', 'WITH', 'SHOW', 'DESCRIBE', 'EXPLAIN'];

export function isQuerySafe(sql: string): { safe: boolean; reason?: string } {
  const normalized = sql.trim().toUpperCase();

  // Skip empty/whitespace
  if (!normalized) return { safe: true };

  // Check for destructive keywords
  for (const kw of DESTRUCTIVE_KEYWORDS) {
    const regex = new RegExp(`\\b${kw}\\b`);
    if (regex.test(normalized)) {
      return { safe: false, reason: `${kw} statements are not allowed in read-only mode` };
    }
  }

  // Check for safe keywords
  for (const kw of SAFE_KEYWORDS) {
    const regex = new RegExp(`^\\b${kw}\\b`);
    if (regex.test(normalized)) {
      return { safe: true };
    }
  }

  // If it doesn't start with a recognized keyword, allow it through
  // (might be a valid expression or comment)
  return { safe: true };
}
