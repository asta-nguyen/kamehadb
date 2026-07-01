use serde::Deserialize;
use tauri::AppHandle;

use crate::app_logs::append_tauri_log;
use crate::connection_profile::{load_connection_profile, ConnectionKind, ConnectionProfile};
use crate::terminal_sessions::{
    start_terminal_session, PtyCommandSpec, TerminalSessionKind, TerminalSessionStarted,
    TerminalSessionState, TerminalSize,
};

const DEFAULT_ORACLE_HOST: &str = "localhost";
const DEFAULT_ORACLE_PORT: u16 = 1521;
const DEFAULT_ORACLE_SERVICE: &str = "FREEPDB1";
const DEFAULT_ORACLE_USERNAME: &str = "system";

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartOracleSqlplusRequest {
    pub connection_id: String,
    pub cols: u16,
    pub rows: u16,
}

#[tauri::command]
pub async fn start_oracle_sqlplus_session(
    app: AppHandle,
    state: tauri::State<'_, TerminalSessionState>,
    request: StartOracleSqlplusRequest,
) -> Result<TerminalSessionStarted, String> {
    let profile = load_connection_profile(&app, &request.connection_id, ConnectionKind::Oracle)
        .map_err(|error| {
            let message = error.to_string();
            append_tauri_log(
                &app,
                "error",
                "oracle-sqlplus",
                "Failed to load saved Oracle profile for sqlplus session",
                Some(message.clone()),
            );
            message
        })?;
    start_terminal_session(
        app.clone(),
        state.inner(),
        TerminalSessionKind::OracleSqlplus,
        TerminalSize {
            cols: request.cols,
            rows: request.rows,
        },
        build_sqlplus_spec(&profile),
    )
    .map_err(|error| {
        let message = error.to_string();
        append_tauri_log(
            &app,
            "error",
            "oracle-sqlplus",
            "Failed to start Oracle sqlplus terminal session",
            Some(message.clone()),
        );
        message
    })
}

fn build_sqlplus_spec(profile: &ConnectionProfile) -> PtyCommandSpec {
    let host = profile.host.as_deref().unwrap_or(DEFAULT_ORACLE_HOST);
    let port = profile.port.unwrap_or(DEFAULT_ORACLE_PORT);
    let service = profile.database.as_deref().unwrap_or(DEFAULT_ORACLE_SERVICE);
    let username = profile.username.as_deref().unwrap_or(DEFAULT_ORACLE_USERNAME);

    let connect_string = if let Some(password) = &profile.password {
        format!("CONNECT {username}/{password}@//{host}:{port}/{service}\n")
    } else {
        format!("CONNECT {username}@//{host}:{port}/{service}\n")
    };

    PtyCommandSpec {
        program: "sqlplus".into(),
        args: vec!["-L".into(), "/NOLOG".into()],
        env: vec![],
        initial_input: Some(connect_string),
        missing_program_hint:
            "Install the Oracle SQL*Plus client tools and try again.".into(),
        started_message: format!("Connecting to Oracle {service} on {host}:{port}"),
    }
}

#[cfg(test)]
mod tests {
    use super::build_sqlplus_spec;
    use crate::connection_profile::ConnectionProfile;

    fn profile() -> ConnectionProfile {
        ConnectionProfile {
            host: Some("localhost".into()),
            port: Some(1521),
            database: Some("FREEPDB1".into()),
            username: Some("SYS".into()),
            password: Some("oracle".into()),
            file_path: None,
        }
    }

    #[test]
    fn sqlplus_spec_embeds_credentials_in_connect_string() {
        let spec = build_sqlplus_spec(&profile());
        assert_eq!(spec.program, "sqlplus");
        assert_eq!(spec.args, vec!["-L".to_string(), "/NOLOG".to_string()]);
        assert!(spec
            .initial_input
            .as_deref()
            .is_some_and(|value| value.contains("CONNECT SYS/oracle@//localhost:1521/FREEPDB1")));
    }

    #[test]
    fn sqlplus_spec_omits_password_when_not_saved() {
        let mut p = profile();
        p.password = None;
        let spec = build_sqlplus_spec(&p);
        assert!(spec
            .initial_input
            .as_deref()
            .is_some_and(|value| value.contains("CONNECT SYS@//localhost:1521/FREEPDB1")));
        assert!(spec
            .initial_input
            .as_deref()
            .is_some_and(|value| !value.contains("SYS/oracle")));
    }
}
