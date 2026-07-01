mod config;
mod jobs;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::app_logs::append_tauri_log;

#[allow(unused_imports)]
pub use config::{build_backup_command, build_restore_command, load_mysql_profile, CommandSpec, MysqlProfile, MysqlToolError};
pub use config::resolve_mysql_program;
pub use jobs::MysqlJobState;

use crate::mysql_tools::jobs::{cancel_job, start_backup_job, start_restore_job};

pub const MYSQL_TOOL_EVENT: &str = "mysql-tool-event";

#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum BackupScope {
    Database,
    Table { table: String },
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BackupFormat {
    Sql,
    Xml,
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
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum MysqlToolKind {
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
pub enum MysqlToolEvent {
    Started {
        job_id: String,
        kind: MysqlToolKind,
        message: String,
    },
    Log {
        job_id: String,
        kind: MysqlToolKind,
        stream: OutputStream,
        line: String,
    },
    Finished {
        job_id: String,
        kind: MysqlToolKind,
        exit_code: i32,
        message: String,
    },
    Failed {
        job_id: String,
        kind: MysqlToolKind,
        exit_code: Option<i32>,
        message: String,
    },
    Cancelled {
        job_id: String,
        kind: MysqlToolKind,
        message: String,
    },
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MysqlJobStarted {
    pub job_id: String,
}

#[tauri::command]
pub async fn start_mysql_backup(
    app: AppHandle,
    state: tauri::State<'_, MysqlJobState>,
    request: StartBackupRequest,
) -> Result<MysqlJobStarted, String> {
    run_backup(app.clone(), state.inner(), request)
        .await
        .map(|job_id| MysqlJobStarted { job_id })
        .map_err(|error| {
            let message = error.to_string();
            append_tauri_log(
                &app,
                "error",
                "mysql-backup",
                "Failed to start MySQL/MariaDB backup job",
                Some(message.clone()),
            );
            message
        })
}

#[tauri::command]
pub async fn start_mysql_restore(
    app: AppHandle,
    state: tauri::State<'_, MysqlJobState>,
    request: StartRestoreRequest,
) -> Result<MysqlJobStarted, String> {
    run_restore(app.clone(), state.inner(), request)
        .await
        .map(|job_id| MysqlJobStarted { job_id })
        .map_err(|error| {
            let message = error.to_string();
            append_tauri_log(
                &app,
                "error",
                "mysql-restore",
                "Failed to start MySQL/MariaDB restore job",
                Some(message.clone()),
            );
            message
        })
}

#[tauri::command]
pub async fn cancel_mysql_job(
    state: tauri::State<'_, MysqlJobState>,
    job_id: String,
) -> Result<(), String> {
    cancel_job(state.inner(), &job_id)
        .await
        .map_err(|error| error.to_string())
}

async fn run_backup(
    app: AppHandle,
    state: &MysqlJobState,
    request: StartBackupRequest,
) -> Result<String, MysqlToolError> {
    let profile = load_mysql_profile(&app, &request.connection_id)?;
    start_backup_job(app, state, profile, request).await
}

async fn run_restore(
    app: AppHandle,
    state: &MysqlJobState,
    request: StartRestoreRequest,
) -> Result<String, MysqlToolError> {
    let profile = load_mysql_profile(&app, &request.connection_id)?;
    start_restore_job(app, state, profile, request).await
}

#[cfg(test)]
mod tests {
    use super::{MysqlToolEvent, MysqlToolKind, OutputStream};

    #[test]
    fn event_payload_uses_camel_case_fields() {
        let payload = serde_json::to_value(MysqlToolEvent::Log {
            job_id: "job-1".into(),
            kind: MysqlToolKind::Backup,
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
