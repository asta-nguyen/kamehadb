export type SchemaColumnSnapshot = {
  readonly name: string;
  readonly type: string;
  readonly nullable: boolean;
  readonly default: string | null;
  readonly primaryKey: boolean;
};

export type SchemaIndexSnapshot = {
  readonly name: string;
  readonly columns: readonly string[];
  readonly unique: boolean;
  readonly primary: boolean;
};

export type SchemaTableSnapshot = {
  readonly id: string;
  readonly name: string;
  readonly schema?: string;
  readonly columns: readonly SchemaColumnSnapshot[];
  readonly indexes: readonly SchemaIndexSnapshot[];
};

export type SchemaSnapshotSource = 'manual' | 'auto-cadence' | 'auto-notify';

export type SchemaSnapshotRecord = {
  readonly id: number;
  readonly connectionId: number;
  readonly capturedAt: string;
  readonly tables: readonly SchemaTableSnapshot[];
  readonly source?: SchemaSnapshotSource;
};

export type SchemaSnapshotSummary = {
  readonly id: number;
  readonly connectionId: number;
  readonly capturedAt: string;
  readonly tableCount: number;
  readonly source?: SchemaSnapshotSource;
};

export type SchemaChangeDescriptor =
  | { readonly type: 'table_added'; readonly table: string }
  | { readonly type: 'table_removed'; readonly table: string }
  | { readonly type: 'column_added'; readonly table: string; readonly column: string; readonly dataType: string }
  | { readonly type: 'column_removed'; readonly table: string; readonly column: string; readonly dataType: string }
  | {
      readonly type: 'column_changed';
      readonly table: string;
      readonly column: string;
      readonly from: string;
      readonly to: string;
    }
  | {
      readonly type: 'index_added';
      readonly table: string;
      readonly index: string;
      readonly columns: readonly string[];
    }
  | {
      readonly type: 'index_removed';
      readonly table: string;
      readonly index: string;
      readonly columns: readonly string[];
    };

export type SchemaChangelogEntry = {
  readonly snapshotId: number;
  readonly capturedAt: string;
  readonly changes: readonly SchemaChangeDescriptor[];
};

export type SchemaChangelog = {
  readonly entries: readonly SchemaChangelogEntry[];
};

export type SchemaDiffInput = {
  readonly fromSnapshotId: number;
  readonly toSnapshotId: number;
};

export type SchemaColumnChangeField = 'type' | 'nullable' | 'default' | 'primaryKey';
export type SchemaIndexChangeField = 'columns' | 'unique' | 'primary';

export type SchemaValueChange<Field extends string> = {
  readonly field: Field;
  readonly from: string | boolean | null | readonly string[];
  readonly to: string | boolean | null | readonly string[];
};

export type SchemaColumnDiff =
  | { readonly type: 'added'; readonly column: SchemaColumnSnapshot }
  | { readonly type: 'removed'; readonly column: SchemaColumnSnapshot }
  | {
      readonly type: 'changed';
      readonly columnName: string;
      readonly before: SchemaColumnSnapshot;
      readonly after: SchemaColumnSnapshot;
      readonly changes: readonly SchemaValueChange<SchemaColumnChangeField>[];
    };

export type SchemaIndexDiff =
  | { readonly type: 'added'; readonly index: SchemaIndexSnapshot }
  | { readonly type: 'removed'; readonly index: SchemaIndexSnapshot }
  | {
      readonly type: 'changed';
      readonly indexName: string;
      readonly before: SchemaIndexSnapshot;
      readonly after: SchemaIndexSnapshot;
      readonly changes: readonly SchemaValueChange<SchemaIndexChangeField>[];
    };

export type SchemaTableDiff =
  | { readonly type: 'added'; readonly tableId: string; readonly table: SchemaTableSnapshot }
  | { readonly type: 'removed'; readonly tableId: string; readonly table: SchemaTableSnapshot }
  | {
      readonly type: 'changed';
      readonly tableId: string;
      readonly tableName: string;
      readonly schema?: string;
      readonly columnDiffs: readonly SchemaColumnDiff[];
      readonly indexDiffs: readonly SchemaIndexDiff[];
      readonly changeCount: number;
    };

export type SchemaDiffStats = {
  readonly tableAdds: number;
  readonly tableRemovals: number;
  readonly tableChanges: number;
  readonly columnAdds: number;
  readonly columnRemovals: number;
  readonly columnChanges: number;
  readonly indexAdds: number;
  readonly indexRemovals: number;
  readonly indexChanges: number;
  readonly totalChanges: number;
};

export type SchemaDiffResult = {
  readonly fromSnapshot: SchemaSnapshotSummary;
  readonly toSnapshot: SchemaSnapshotSummary;
  readonly tableDiffs: readonly SchemaTableDiff[];
  readonly stats: SchemaDiffStats;
};

export type MigrationInput = {
  readonly fromSnapshotId: number;
  readonly toSnapshotId: number;
};

export type MigrationResult = {
  readonly statements: readonly string[];
  readonly dialect: string;
  readonly fromSnapshot: string;
  readonly toSnapshot: string;
};

export function quoteSqlIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

/** Persisted watcher configuration per connection. Stored in the schema_watchers metadata table. */
export type SchemaWatcherConfig = {
  readonly connectionId: number;
  readonly cadenceEnabled: boolean;
  readonly notifyEnabled: boolean;
  readonly intervalMs: number;
};

/** Runtime status returned by the watcher status route. */
export type SchemaWatcherStatus = {
  readonly cadenceRunning: boolean;
  readonly notifyRunning: boolean;
  readonly intervalMs: number;
  readonly lastCaptureAt: string | null;
};
