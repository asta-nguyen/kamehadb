use serde::Deserialize;
use tauri::AppHandle;

use crate::app_logs::append_tauri_log;
use crate::mysql_tools::{load_mysql_profile, resolve_mysql_program, MysqlProfile};
use crate::terminal_sessions::{
    start_terminal_session, PtyCommandSpec, TerminalSessionKind, TerminalSessionStarted,
    TerminalSessionState, TerminalSize,
};

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartMysqlShellRequest {
    pub connection_id: String,
    pub cols: u16,
    pub rows: u16,
}

#[tauri::command]
pub async fn start_mysql_shell_session(
    app: AppHandle,
    state: tauri::State<'_, TerminalSessionState>,
    request: StartMysqlShellRequest,
) -> Result<TerminalSessionStarted, String> {
    let profile =
        load_mysql_profile(&app, &request.connection_id).map_err(|error| {
            let message = error.to_string();
            append_tauri_log(
                &app,
                "error",
                "mysql-shell",
                "Failed to load saved MySQL/MariaDB profile for shell session",
                Some(message.clone()),
            );
            message
        })?;
    start_terminal_session(
        app.clone(),
        state.inner(),
        TerminalSessionKind::MysqlShell,
        TerminalSize {
            cols: request.cols,
            rows: request.rows,
        },
        build_mysql_shell_spec(&resolve_mysql_program(&app, "mysql", &profile), &profile),
    )
    .map_err(|error| {
        let message = error.to_string();
        append_tauri_log(
            &app,
            "error",
            "mysql-shell",
            "Failed to start MySQL/MariaDB terminal session",
            Some(message.clone()),
        );
        message
    })
}

fn build_mysql_shell_spec(program: &str, profile: &MysqlProfile) -> PtyCommandSpec {
    let mut args = vec![
        format!("--host={}", profile.host),
        format!("--port={}", profile.port),
        format!("--user={}", profile.username),
        profile.database.clone(),
    ];
    if profile.ssl {
        // MariaDB clients reject MySQL's `--ssl-mode`; use MariaDB's `--ssl` flag for them.
        if profile.kind == "mariadb" {
            args.push("--ssl".into());
        } else {
            args.push("--ssl-mode=REQUIRED".into());
        }
    }

    let mut env = Vec::new();
    if let Some(password) = &profile.password {
        env.push(("MYSQL_PWD".into(), password.clone()));
    }

    PtyCommandSpec {
        args,
        env,
        missing_program_hint: "Install MySQL or MariaDB client tools and try again.".into(),
        program: program.into(),
        started_message: format!("Connected to {}", profile.database),
    }
}

#[cfg(test)]
mod tests {
    use super::build_mysql_shell_spec;
    use crate::mysql_tools::MysqlProfile;

    fn profile() -> MysqlProfile {
        MysqlProfile {
            kind: "mysql".into(),
            host: "localhost".into(),
            port: 3306,
            database: "kamehadb".into(),
            username: "kameha".into(),
            password: Some("secret".into()),
            ssl: true,
        }
    }

    fn profile_without_password() -> MysqlProfile {
        MysqlProfile {
            password: None,
            ..profile()
        }
    }

    #[test]
    fn mysql_shell_command_uses_saved_connection_context() {
        let spec = build_mysql_shell_spec("mysql", &profile());

        assert_eq!(
            std::path::Path::new(&spec.program)
                .file_name()
                .and_then(|value| value.to_str()),
            Some("mysql")
        );
        assert!(spec
            .args
            .iter()
            .any(|value| value == "--host=localhost"));
        assert!(spec
            .args
            .iter()
            .any(|value| value == "kamehadb"));
        assert!(spec
            .args
            .iter()
            .any(|value| value == "--ssl-mode=REQUIRED"));
        assert!(spec
            .env
            .iter()
            .any(|(key, value)| key == "MYSQL_PWD" && value == "secret"));
    }

    #[test]
    fn mysql_shell_command_allows_terminal_prompt_without_stored_password() {
        let spec = build_mysql_shell_spec("mysql", &profile_without_password());

        assert!(!spec
            .env
            .iter()
            .any(|(key, _value)| key == "MYSQL_PWD"));
    }

    #[test]
    fn mariadb_shell_uses_mariadb_ssl_flag() {
        let mariadb = MysqlProfile {
            kind: "mariadb".into(),
            ..profile()
        };
        let spec = build_mysql_shell_spec("mariadb", &mariadb);

        // MariaDB clients reject --ssl-mode; they use --ssl instead.
        assert!(spec.args.iter().any(|value| value == "--ssl"));
        assert!(!spec
            .args
            .iter()
            .any(|value| value == "--ssl-mode=REQUIRED"));
    }
}
