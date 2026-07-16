import type { AiSchemaAction } from '@kamehadb/shared';

/** Canonical prompt templates for schema-tree right-click AI actions.
 * The desktop constructs the user message client-side from AI_SCHEMA_ACTIONS
 * (apps/desktop/src/lib/constants.ts); these server-side templates mirror
 * that text for potential API reuse and stay in sync via the AiSchemaAction type. */

export function explainSchemaPrompt(qualifiedTable: string): string {
  return `Explain the structure and purpose of the table ${qualifiedTable}. Describe each column, its type, primary and foreign keys, and any notable constraints or relationships.`;
}

export function generateTestDataPrompt(qualifiedTable: string): string {
  return `Generate realistic test data for the table ${qualifiedTable}. Produce INSERT statements that respect column types, NOT NULL constraints, primary keys, and foreign key relationships. Provide 5 rows.`;
}

export function suggestIndexPrompt(qualifiedTable: string): string {
  return `Suggest indexes for the table ${qualifiedTable} based on its columns and existing indexes. Explain the rationale for each suggestion and provide the CREATE INDEX statements.`;
}

/** Map action id to prompt template function. */
export const PROMPT_TEMPLATES: Record<AiSchemaAction, (qualifiedTable: string) => string> = {
  'explain-schema': explainSchemaPrompt,
  'generate-test-data': generateTestDataPrompt,
  'suggest-index': suggestIndexPrompt,
};
