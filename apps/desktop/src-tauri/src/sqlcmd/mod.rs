use serde::Deserialize;
use tauri::AppHandle;

use crate::app_logs::append_tauri_log;
use crate::profiles::load_profile;
use crate::terminal_sessions::{
    start_terminal_session, PtyCommandSpec, TerminalSessionKind, TerminalSessionStarted,
    TerminalSessionState, TerminalSize,
};

const SQLSERVER_DEFAULT_PORT: u16 = 1433;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartSqlcmdRequest {
    pub connection_id: String,
    pub cols: u16,
    pub rows: u16,
}

#[tauri::command]
pub async fn start_sqlcmd_session(
    app: AppHandle,
    state: tauri::State<'_, TerminalSessionState>,
    request: StartSqlcmdRequest,
) -> Result<TerminalSessionStarted, String> {
    let profile = load_profile(&app, &request.connection_id).map_err(|error| {
        let message = error.to_string();
        append_tauri_log(
            &app,
            "error",
            "sqlcmd",
            "Failed to load saved SQL Server profile for sqlcmd session",
            Some(message.clone()),
        );
        message
    })?;

    if profile.kind != "sqlserver" {
        return Err(format!("Expected sqlserver connection, got {}", profile.kind));
    }

    let host = profile.host.as_ref().filter(|h| !h.is_empty()).ok_or(
        "The saved SQL Server connection is missing a host".to_string(),
    )?;
    let port = profile.port.unwrap_or(SQLSERVER_DEFAULT_PORT);
    let database = profile
        .database
        .as_ref()
        .filter(|d| !d.is_empty())
        .map(|d| d.as_str())
        .unwrap_or("master");

    start_terminal_session(
        app.clone(),
        state.inner(),
        TerminalSessionKind::Sqlcmd,
        TerminalSize {
            cols: request.cols,
            rows: request.rows,
        },
        build_sqlcmd_spec(host, port, database, profile.username.as_deref(), profile.password.as_deref()),
    )
    .map_err(|error| {
        let message = error.to_string();
        append_tauri_log(
            &app,
            "error",
            "sqlcmd",
            "Failed to start sqlcmd terminal session",
            Some(message.clone()),
        );
        message
    })
}

fn build_sqlcmd_spec(
    host: &str,
    port: u16,
    database: &str,
    username: Option<&str>,
    password: Option<&str>,
) -> PtyCommandSpec {
    let server = format!("{host},{port}");
    let mut args = vec!["-S".into(), server, "-d".into(), database.into(), "-C".into()];
    let mut env = Vec::new();

    if let Some(user) = username {
        args.push("-U".into());
        args.push(user.into());
        if let Some(pass) = password {
            env.push(("SQLCMDPASSWORD".into(), pass.into()));
        }
    } else {
        args.push("-E".into());
    }

    PtyCommandSpec {
        program: "sqlcmd".into(),
        args,
        env,
        missing_program_hint:
            "Install the SQL Server command-line tools and try again.".into(),
        started_message: format!("Connected to {database} on {host}:{port}"),
    }
}

#[cfg(test)]
mod tests {
    use super::build_sqlcmd_spec;

    #[test]
    fn sqlcmd_command_uses_server_and_credentials() {
        let spec = build_sqlcmd_spec("localhost", 1433, "kamehadb", Some("sa"), Some("pass"));
        assert_eq!(spec.program, "sqlcmd");
        assert!(spec.args.windows(2).any(|pair| pair == ["-S", "localhost,1433"]));
        assert!(spec.args.windows(2).any(|pair| pair == ["-d", "kamehadb"]));
        assert!(spec.args.iter().any(|value| value == "-C"));
        assert!(spec.args.windows(2).any(|pair| pair == ["-U", "sa"]));
        assert!(!spec.args.iter().any(|value| value == "-P"));
        assert!(spec
            .env
            .iter()
            .any(|(key, value)| key == "SQLCMDPASSWORD" && value == "pass"));
    }

    #[test]
    fn sqlcmd_command_uses_windows_auth_without_username() {
        let spec = build_sqlcmd_spec("localhost", 1433, "master", None, None);
        assert!(spec.args.iter().any(|value| value == "-E"));
        assert!(spec.args.iter().any(|value| value == "-C"));
        assert!(!spec.args.iter().any(|value| value == "-U"));
    }
}
