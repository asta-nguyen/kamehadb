export function parseVectorText(vectorText: string): number[] {
  const parsed = JSON.parse(vectorText) as unknown;
  if (
    !Array.isArray(parsed) ||
    parsed.length === 0 ||
    !parsed.every((value) => typeof value === 'number' && Number.isFinite(value))
  ) {
    throw new Error('Vector must be a JSON array of numbers');
  }
  return parsed;
}

export function formatVectorText(value: unknown): string | null {
  if (typeof value === 'string') {
    try {
      return JSON.stringify(parseVectorText(value));
    } catch {
      return null;
    }
  }
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    !value.every((item) => typeof item === 'number' && Number.isFinite(item))
  ) {
    return null;
  }
  return JSON.stringify(value);
}

export function parsePostgresTableId(tableId: string): { schema: string; table: string } {
  const [schemaPart, tablePart] = tableId.split('.', 2);
  if (!tablePart) {
    return { schema: 'public', table: schemaPart };
  }
  return { schema: schemaPart, table: tablePart };
}
