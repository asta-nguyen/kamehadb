use serde::Deserialize;
use tauri::AppHandle;

use crate::postgres_tools::{load_postgres_profile, PostgresProfile};
use crate::terminal_sessions::{
    start_terminal_session, PtyCommandSpec, TerminalSessionKind, TerminalSessionStarted,
    TerminalSessionState, TerminalSize,
};

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartPostgresPsqlRequest {
    pub connection_id: String,
    pub cols: u16,
    pub rows: u16,
}

#[tauri::command]
pub async fn start_postgres_psql_session(
    app: AppHandle,
    state: tauri::State<'_, TerminalSessionState>,
    request: StartPostgresPsqlRequest,
) -> Result<TerminalSessionStarted, String> {
    let profile =
        load_postgres_profile(&app, &request.connection_id).map_err(|error| error.to_string())?;
    start_terminal_session(
        app,
        state.inner(),
        TerminalSessionKind::PostgresPsql,
        TerminalSize {
            cols: request.cols,
            rows: request.rows,
        },
        build_psql_spec(&profile),
    )
    .map_err(|error| error.to_string())
}

fn build_psql_spec(profile: &PostgresProfile) -> PtyCommandSpec {
    let mut args = vec![
        "--host".into(),
        profile.host.clone(),
        "--port".into(),
        profile.port.to_string(),
        "--username".into(),
        profile.username.clone(),
        "--dbname".into(),
        profile.database.clone(),
        "--pset".into(),
        "pager=off".into(),
    ];
    if profile.ssl {
        args.push("--set".into());
        args.push("sslmode=require".into());
    }

    let mut env = Vec::new();
    if let Some(password) = &profile.password {
        env.push(("PGPASSWORD".into(), password.clone()));
    }
    if profile.ssl {
        env.push(("PGSSLMODE".into(), "require".into()));
    }

    PtyCommandSpec {
        args,
        env,
        program: "psql".into(),
        started_message: format!("Connected to {}", profile.database),
    }
}

#[cfg(test)]
mod tests {
    use super::build_psql_spec;
    use crate::postgres_tools::PostgresProfile;

    fn profile() -> PostgresProfile {
        PostgresProfile {
            host: "localhost".into(),
            port: 5432,
            database: "kamehadb".into(),
            username: "kameha".into(),
            password: Some("secret".into()),
            ssl: true,
        }
    }

    fn profile_without_password() -> PostgresProfile {
        PostgresProfile {
            password: None,
            ..profile()
        }
    }

    #[test]
    fn psql_command_uses_saved_connection_context() {
        let spec = build_psql_spec(&profile());

        assert_eq!(spec.program, "psql");
        assert!(spec
            .args
            .windows(2)
            .any(|pair| pair == ["--host", "localhost"]));
        assert!(spec
            .args
            .windows(2)
            .any(|pair| pair == ["--dbname", "kamehadb"]));
        assert!(!spec.args.iter().any(|value| value == "--no-password"));
        assert!(spec
            .env
            .iter()
            .any(|(key, value)| key == "PGPASSWORD" && value == "secret"));
        assert!(spec
            .env
            .iter()
            .any(|(key, value)| key == "PGSSLMODE" && value == "require"));
    }

    #[test]
    fn psql_command_allows_terminal_prompt_without_stored_password() {
        let spec = build_psql_spec(&profile_without_password());

        assert!(!spec.args.iter().any(|value| value == "--no-password"));
        assert!(!spec.env.iter().any(|(key, _value)| key == "PGPASSWORD"));
    }
}
