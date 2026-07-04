use serde::Deserialize;
use tauri::AppHandle;

use crate::app_logs::append_tauri_log;
use crate::profiles::{load_profile, ProfileError};
use crate::terminal_sessions::{
    start_terminal_session, PtyCommandSpec, TerminalSessionKind, TerminalSessionStarted,
    TerminalSessionState, TerminalSize,
};

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartSqlite3Request {
    pub connection_id: String,
    pub cols: u16,
    pub rows: u16,
}

#[tauri::command]
pub async fn start_sqlite3_session(
    app: AppHandle,
    state: tauri::State<'_, TerminalSessionState>,
    request: StartSqlite3Request,
) -> Result<TerminalSessionStarted, String> {
    let profile = load_profile(&app, &request.connection_id).map_err(|error| {
        let message = error.to_string();
        append_tauri_log(
            &app,
            "error",
            "sqlite3",
            "Failed to load saved SQLite profile for sqlite3 session",
            Some(message.clone()),
        );
        message
    })?;

    if profile.kind != "sqlite" {
        return Err(format!("Expected sqlite connection, got {}", profile.kind));
    }

    let file_path = profile.file_path.as_ref().filter(|p| !p.is_empty()).ok_or(
        ProfileError::MissingSqliteFilePath.to_string(),
    )?;

    start_terminal_session(
        app.clone(),
        state.inner(),
        TerminalSessionKind::Sqlite3,
        TerminalSize {
            cols: request.cols,
            rows: request.rows,
        },
        build_sqlite3_spec(file_path),
    )
    .map_err(|error| {
        let message = error.to_string();
        append_tauri_log(
            &app,
            "error",
            "sqlite3",
            "Failed to start sqlite3 terminal session",
            Some(message.clone()),
        );
        message
    })
}

fn build_sqlite3_spec(file_path: &str) -> PtyCommandSpec {
    PtyCommandSpec {
        program: "sqlite3".into(),
        args: vec![file_path.into()],
        env: Vec::new(),
        missing_program_hint:
            "Install the SQLite command-line tools and try again.".into(),
        started_message: format!("Connected to {file_path}"),
    }
}

#[cfg(test)]
mod tests {
    use super::build_sqlite3_spec;

    #[test]
    fn sqlite3_command_uses_file_path() {
        let spec = build_sqlite3_spec("/data/app.db");
        assert_eq!(spec.program, "sqlite3");
        assert_eq!(spec.args, vec!["/data/app.db"]);
    }
}
