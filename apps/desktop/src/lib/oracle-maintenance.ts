import { invokeTauri } from '@/lib/tauri';

export const ORACLE_TOOL_EVENT = 'oracle-tool-event';

export type OracleBackupRequest = {
  readonly connectionId: string;
  readonly directoryObject: string;
  readonly dumpFile: string;
  readonly schema: string;
};

export type OracleRestoreRequest = {
  readonly connectionId: string;
  readonly directoryObject: string;
  readonly dumpFile: string;
  readonly sourceSchema: string;
  readonly targetSchema: string;
  readonly replaceExisting: boolean;
};

export type OracleToolKind = 'backup' | 'restore';

export type OracleToolEvent =
  | {
      readonly jobId: string;
      readonly kind: OracleToolKind;
      readonly type: 'started';
      readonly message: string;
    }
  | {
      readonly jobId: string;
      readonly kind: OracleToolKind;
      readonly type: 'log';
      readonly stream: 'stdout' | 'stderr';
      readonly line: string;
    }
  | {
      readonly jobId: string;
      readonly kind: OracleToolKind;
      readonly type: 'finished';
      readonly exitCode: number;
      readonly message: string;
    }
  | {
      readonly jobId: string;
      readonly kind: OracleToolKind;
      readonly type: 'failed';
      readonly exitCode: number | null;
      readonly message: string;
    }
  | {
      readonly jobId: string;
      readonly kind: OracleToolKind;
      readonly type: 'cancelled';
      readonly message: string;
    };

type OracleJobStart = {
  readonly jobId: string;
};

export function defaultOracleDumpFile(schema: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const base = schema
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-');
  return `${base || 'oracle'}-${date}.dmp`;
}

export async function startOracleBackup(request: OracleBackupRequest): Promise<OracleJobStart> {
  return invokeTauri<OracleJobStart>('start_oracle_backup', { request });
}

export async function startOracleRestore(request: OracleRestoreRequest): Promise<OracleJobStart> {
  return invokeTauri<OracleJobStart>('start_oracle_restore', { request });
}

export async function cancelOracleToolJob(jobId: string): Promise<void> {
  await invokeTauri('cancel_oracle_job', { jobId });
}
