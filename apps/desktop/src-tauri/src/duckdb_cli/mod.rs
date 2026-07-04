use serde::Deserialize;
use tauri::AppHandle;

use crate::app_logs::append_tauri_log;
use crate::connection_profile::{load_connection_profile, resolve_client_tool, ConnectionKind, ConnectionProfile};
use crate::terminal_sessions::{
    start_terminal_session, PtyCommandSpec, TerminalSessionKind, TerminalSessionStarted,
    TerminalSessionState, TerminalSize,
};

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartDuckdbCliRequest {
    pub connection_id: String,
    pub cols: u16,
    pub rows: u16,
}

#[tauri::command]
pub async fn start_duckdb_cli_session(
    app: AppHandle,
    state: tauri::State<'_, TerminalSessionState>,
    request: StartDuckdbCliRequest,
) -> Result<TerminalSessionStarted, String> {
    let profile = load_connection_profile(&app, &request.connection_id, ConnectionKind::Duckdb)
        .map_err(|error| {
            let message = error.to_string();
            append_tauri_log(
                &app,
                "error",
                "duckdb-cli",
                "Failed to load saved DuckDB profile for CLI session",
                Some(message.clone()),
            );
            message
        })?;
    start_terminal_session(
        app.clone(),
        state.inner(),
        TerminalSessionKind::DuckdbCli,
        TerminalSize {
            cols: request.cols,
            rows: request.rows,
        },
        build_cli_spec(&resolve_client_tool(&app, "duckdb"), &profile),
    )
    .map_err(|error| {
        let message = error.to_string();
        append_tauri_log(
            &app,
            "error",
            "duckdb-cli",
            "Failed to start DuckDB CLI terminal session",
            Some(message.clone()),
        );
        message
    })
}

fn build_cli_spec(program: &str, profile: &ConnectionProfile) -> PtyCommandSpec {
    let mut args = Vec::new();
    if let Some(file_path) = &profile.file_path {
        args.push(file_path.clone());
    }

    let label = profile
        .file_path
        .as_deref()
        .map(|p| {
            std::path::Path::new(p)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or(p)
        })
        .unwrap_or("in-memory");

    PtyCommandSpec {
        program: program.into(),
        args,
        env: vec![],
        initial_input: None,
        missing_program_hint: "Install the DuckDB CLI tools and try again.".into(),
        started_message: format!("Opening DuckDB database: {label}"),
    }
}

#[cfg(test)]
mod tests {
    use super::build_cli_spec;
    use crate::connection_profile::ConnectionProfile;


    fn profile_with_file() -> ConnectionProfile {
        ConnectionProfile {
            host: None,
            port: None,
            database: None,
            username: None,
            password: None,
            file_path: Some("/home/user/data.duckdb".into()),
        }
    }

    fn profile_in_memory() -> ConnectionProfile {
        ConnectionProfile {
            host: None,
            port: None,
            database: None,
            username: None,
            password: None,
            file_path: None,
        }
    }

    #[test]
    fn duckdb_spec_passes_file_path() {
        let spec = build_cli_spec("duckdb", &profile_with_file());
        assert_eq!(spec.program, "duckdb");
        assert_eq!(spec.args, vec!["/home/user/data.duckdb".to_string()]);
    }

    #[test]
    fn duckdb_spec_in_memory_has_no_args() {
        let spec = build_cli_spec("duckdb", &profile_in_memory());
        assert!(spec.args.is_empty());
    }
}
