import type {
  MigrationInput,
  MigrationResult,
  SchemaChangelog,
  SchemaDiffInput,
  SchemaDiffResult,
  SchemaSnapshotSummary,
} from '@kamehadb/shared';
import { request } from './api-client';

export const schemaApi = {
  captureSchemaSnapshot: (connectionId: string) =>
    request<{ id: string; capturedAt: string; tableCount: number }>('POST', `/sql/${connectionId}/capture-schema`),

  getSchemaSnapshots: (connectionId: string) =>
    request<{ snapshots: readonly SchemaSnapshotSummary[] }>('GET', `/sql/${connectionId}/schema-snapshots`),

  getSchemaChangelog: (connectionId: string) =>
    request<SchemaChangelog>('GET', `/sql/${connectionId}/schema-changelog`),

  getSchemaDiff: (connectionId: string, input: SchemaDiffInput) =>
    request<SchemaDiffResult>('POST', `/sql/${connectionId}/schema-diff`, input),

  generateMigration: (connectionId: string, input: MigrationInput) =>
    request<MigrationResult>('POST', `/sql/${connectionId}/generate-migration`, input),
} as const;
