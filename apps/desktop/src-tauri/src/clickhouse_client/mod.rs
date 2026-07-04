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
pub struct StartClickhouseClientRequest {
    pub connection_id: String,
    pub cols: u16,
    pub rows: u16,
}

#[tauri::command]
pub async fn start_clickhouse_client_session(
    app: AppHandle,
    state: tauri::State<'_, TerminalSessionState>,
    request: StartClickhouseClientRequest,
) -> Result<TerminalSessionStarted, String> {
    let profile =
        load_connection_profile(&app, &request.connection_id, ConnectionKind::Clickhouse).map_err(
            |error| {
                let message = error.to_string();
                append_tauri_log(
                    &app,
                    "error",
                    "clickhouse-client",
                    "Failed to load saved ClickHouse profile for client session",
                    Some(message.clone()),
                );
                message
            },
        )?;
    start_terminal_session(
        app.clone(),
        state.inner(),
        TerminalSessionKind::ClickhouseClient,
        TerminalSize {
            cols: request.cols,
            rows: request.rows,
        },
        build_client_spec(&resolve_client_tool(&app, "clickhouse-client"), &profile),
    )
    .map_err(|error| {
        let message = error.to_string();
        append_tauri_log(
            &app,
            "error",
            "clickhouse-client",
            "Failed to start ClickHouse client terminal session",
            Some(message.clone()),
        );
        message
    })
}

fn build_client_spec(program: &str, profile: &ConnectionProfile) -> PtyCommandSpec {
    let host = profile.host.as_deref().unwrap_or("localhost");
    // clickhouse-client uses the native protocol on port 9000, not the HTTP port 8123
    // stored in the connection profile (which is for the sidecar's HTTP client).
    let port = 9000;
    let database = profile.database.as_deref().unwrap_or("default");
    let username = profile.username.as_deref().unwrap_or("default");

    let mut args = vec![
        "--host".into(),
        host.into(),
        "--port".into(),
        port.to_string(),
        "--database".into(),
        database.into(),
        "--user".into(),
        username.into(),
    ];
    let mut env = Vec::new();

    if let Some(password) = &profile.password {
        env.push(("CLICKHOUSE_PASSWORD".into(), password.clone()));
    }

    args.push("--highlight".into());
    args.push("1".into());

    PtyCommandSpec {
        program: program.into(),
        args,
        env,
        initial_input: None,
        missing_program_hint:
            "Install the ClickHouse client tools and try again.".into(),
        started_message: format!("Connecting to ClickHouse {database} on {host}:{port}"),
    }
}

#[cfg(test)]
mod tests {
    use super::build_client_spec;
    use crate::connection_profile::ConnectionProfile;


    fn profile() -> ConnectionProfile {
        ConnectionProfile {
            host: Some("localhost".into()),
            port: Some(9000),
            database: Some("kamehadb".into()),
            username: Some("default".into()),
            password: Some("secret".into()),
            file_path: None,
        }
    }

    #[test]
    fn clickhouse_spec_passes_connection_args() {
        let spec = build_client_spec("clickhouse-client", &profile());
        assert_eq!(spec.program, "clickhouse-client");
        assert!(spec.args.windows(2).any(|p| p == ["--host", "localhost"]));
        assert!(spec.args.windows(2).any(|p| p == ["--database", "kamehadb"]));
        assert!(spec.args.windows(2).any(|p| p == ["--user", "default"]));
        assert!(!spec.args.iter().any(|value| value == "--password"));
        assert!(spec
            .env
            .iter()
            .any(|(key, value)| key == "CLICKHOUSE_PASSWORD" && value == "secret"));
    }

    #[test]
    fn clickhouse_spec_omits_password_arg_when_not_saved() {
        let mut p = profile();
        p.password = None;
        let spec = build_client_spec("clickhouse-client", &p);
        assert!(!spec.args.iter().any(|v| v == "--password"));
    }
}
