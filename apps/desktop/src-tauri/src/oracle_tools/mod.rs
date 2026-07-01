mod config;
mod jobs;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::app_logs::append_tauri_log;

pub use config::{resolve_oracle_program, CommandSpec, OracleProfile, OracleToolError};
pub use jobs::OracleJobState;

use crate::oracle_tools::config::{build_backup_command, build_restore_command, load_oracle_profile};
use crate::oracle_tools::jobs::{cancel_job, start_backup_job, start_restore_job};

pub const ORACLE_TOOL_EVENT: &str = "oracle-tool-event";

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartBackupRequest {
    pub connection_id: String,
    pub directory_object: String,
    pub dump_file: String,
    pub schema: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartRestoreRequest {
    pub connection_id: String,
    pub directory_object: String,
    pub dump_file: String,
    pub source_schema: String,
    pub target_schema: String,
    pub replace_existing: bool,
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum OracleToolKind {
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
pub enum OracleToolEvent {
    Started {
        job_id: String,
        kind: OracleToolKind,
        message: String,
    },
    Log {
        job_id: String,
        kind: OracleToolKind,
        stream: OutputStream,
        line: String,
    },
    Finished {
        job_id: String,
        kind: OracleToolKind,
        exit_code: i32,
        message: String,
    },
    Failed {
        job_id: String,
        kind: OracleToolKind,
        exit_code: Option<i32>,
        message: String,
    },
    Cancelled {
        job_id: String,
        kind: OracleToolKind,
        message: String,
    },
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OracleJobStarted {
    pub job_id: String,
}

#[tauri::command]
pub async fn start_oracle_backup(
    app: AppHandle,
    state: tauri::State<'_, OracleJobState>,
    request: StartBackupRequest,
) -> Result<OracleJobStarted, String> {
    run_backup(app.clone(), state.inner(), request)
        .await
        .map(|job_id| OracleJobStarted { job_id })
        .map_err(|error| {
            let message = error.to_string();
            append_tauri_log(
                &app,
                "error",
                "oracle-backup",
                "Failed to start Oracle backup job",
                Some(message.clone()),
            );
            message
        })
}

#[tauri::command]
pub async fn start_oracle_restore(
    app: AppHandle,
    state: tauri::State<'_, OracleJobState>,
    request: StartRestoreRequest,
) -> Result<OracleJobStarted, String> {
    run_restore(app.clone(), state.inner(), request)
        .await
        .map(|job_id| OracleJobStarted { job_id })
        .map_err(|error| {
            let message = error.to_string();
            append_tauri_log(
                &app,
                "error",
                "oracle-restore",
                "Failed to start Oracle restore job",
                Some(message.clone()),
            );
            message
        })
}

#[tauri::command]
pub async fn cancel_oracle_job(
    state: tauri::State<'_, OracleJobState>,
    job_id: String,
) -> Result<(), String> {
    cancel_job(state.inner(), &job_id)
        .await
        .map_err(|error| error.to_string())
}

async fn run_backup(
    app: AppHandle,
    state: &OracleJobState,
    request: StartBackupRequest,
) -> Result<String, OracleToolError> {
    let profile = load_oracle_profile(&app, &request.connection_id)?;
    let spec = build_backup_command(&profile, &request)?;
    start_backup_job(app, state, spec).await
}

async fn run_restore(
    app: AppHandle,
    state: &OracleJobState,
    request: StartRestoreRequest,
) -> Result<String, OracleToolError> {
    let profile = load_oracle_profile(&app, &request.connection_id)?;
    let spec = build_restore_command(&profile, &request)?;
    start_restore_job(app, state, spec).await
}

#[cfg(test)]
mod tests {
    use super::{OracleToolEvent, OracleToolKind, OutputStream};

    #[test]
    fn event_payload_uses_camel_case_fields() {
        let payload = serde_json::to_value(OracleToolEvent::Log {
            job_id: "job-1".into(),
            kind: OracleToolKind::Backup,
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
    }
}
