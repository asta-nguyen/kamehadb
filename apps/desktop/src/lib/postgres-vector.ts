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
