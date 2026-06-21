mod config;
mod jobs;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::app_logs::append_tauri_log;

// Re-exported for use by jobs.rs and external consumers (tests, future modules).
#[allow(unused_imports)]
pub use config::{build_backup_command, build_restore_command, load_postgres_profile, PostgresProfile, PostgresToolError};
pub use config::resolve_postgres_program;
pub use jobs::PostgresJobState;

use crate::postgres_tools::jobs::{cancel_job, start_backup_job, start_restore_job};

pub const POSTGRES_TOOL_EVENT: &str = "postgres-tool-event";

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BackupFormat {
    Plain,
    Custom,
    Tar,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum BackupScope {
    Database,
    Schema { schema: String },
    Table { schema: String, table: String },
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartBackupRequest {
    pub connection_id: String,
    pub output_path: String,
    pub format: BackupFormat,
    pub scope: BackupScope,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartRestoreRequest {
    pub connection_id: String,
    pub input_path: String,
    pub target_database: String,
    pub clean: bool,
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PostgresToolKind {
    Backup,
    Restore,
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum OutputStream {
    Stdout,
    Stderr,
}

#[derive(Clone, Debug, Serialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum PostgresToolEvent {
    Started {
        job_id: String,
        kind: PostgresToolKind,
        message: String,
    },
    Log {
        job_id: String,
        kind: PostgresToolKind,
        stream: OutputStream,
        line: String,
    },
    Finished {
        job_id: String,
        kind: PostgresToolKind,
        exit_code: i32,
        message: String,
    },
    Failed {
        job_id: String,
        kind: PostgresToolKind,
        exit_code: Option<i32>,
        message: String,
    },
    Cancelled {
        job_id: String,
        kind: PostgresToolKind,
        message: String,
    },
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PostgresJobStarted {
    pub job_id: String,
}

#[tauri::command]
pub async fn start_postgres_backup(
    app: AppHandle,
    state: tauri::State<'_, PostgresJobState>,
    request: StartBackupRequest,
) -> Result<PostgresJobStarted, String> {
    run_backup(app.clone(), state.inner(), request)
        .await
        .map(|job_id| PostgresJobStarted { job_id })
        .map_err(|error| {
            let message = error.to_string();
            append_tauri_log(
                &app,
                "error",
                "postgres-backup",
                "Failed to start PostgreSQL backup job",
                Some(message.clone()),
            );
            message
        })
}

#[tauri::command]
pub async fn start_postgres_restore(
    app: AppHandle,
    state: tauri::State<'_, PostgresJobState>,
    request: StartRestoreRequest,
) -> Result<PostgresJobStarted, String> {
    run_restore(app.clone(), state.inner(), request)
        .await
        .map(|job_id| PostgresJobStarted { job_id })
        .map_err(|error| {
            let message = error.to_string();
            append_tauri_log(
                &app,
                "error",
                "postgres-restore",
                "Failed to start PostgreSQL restore job",
                Some(message.clone()),
            );
            message
        })
}

#[tauri::command]
pub async fn cancel_postgres_job(
    state: tauri::State<'_, PostgresJobState>,
    job_id: String,
) -> Result<(), String> {
    cancel_job(state.inner(), &job_id)
        .await
        .map_err(|error| error.to_string())
}

async fn run_backup(
    app: AppHandle,
    state: &PostgresJobState,
    request: StartBackupRequest,
) -> Result<String, PostgresToolError> {
    let profile = load_postgres_profile(&app, &request.connection_id)?;
    start_backup_job(app, state, profile, request).await
}

async fn run_restore(
    app: AppHandle,
    state: &PostgresJobState,
    request: StartRestoreRequest,
) -> Result<String, PostgresToolError> {
    let profile = load_postgres_profile(&app, &request.connection_id)?;
    start_restore_job(app, state, profile, request).await
}

#[cfg(test)]
mod tests {
    use super::{OutputStream, PostgresToolEvent, PostgresToolKind};

    #[test]
    fn event_payload_uses_camel_case_fields() {
        let payload = serde_json::to_value(PostgresToolEvent::Log {
            job_id: "job-1".into(),
            kind: PostgresToolKind::Backup,
            stream: OutputStream::Stdout,
            line: "working".into(),
        })
        .expect("event should serialize");

        assert_eq!(
            payload.get("type").and_then(|value| value.as_str()),
            Some("log")
        );
        assert_eq!(
            payload.get("jobId").and_then(|value| value.as_str()),
            Some("job-1")
        );
        assert_eq!(
            payload.get("stream").and_then(|value| value.as_str()),
            Some("stdout")
        );
        assert_eq!(
            payload.get("line").and_then(|value| value.as_str()),
            Some("working")
        );
    }
}
