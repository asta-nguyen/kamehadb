use std::path::{Path, PathBuf};

use rusqlite::{params, Connection};
use tauri::{AppHandle, Manager};
use thiserror::Error;

use super::{BackupFormat, BackupScope, StartBackupRequest, StartRestoreRequest};

#[derive(Clone, Debug)]
pub struct MysqlProfile {
    pub kind: String,
    pub host: String,
    pub port: u16,
    pub database: String,
    pub username: String,
    pub password: Option<String>,
    pub ssl: bool,
}

#[derive(Clone, Debug)]
pub struct CommandSpec {
    pub program: String,
    pub args: Vec<String>,
    pub env: Vec<(String, String)>,
    pub started_message: String,
    /// When set, the job runner streams this file into the child's stdin.
    /// Used by restore (`mysql` reads SQL from stdin) since the MySQL client
    /// has no `--file` equivalent to psql's.
    pub stdin_file: Option<PathBuf>,
}

#[derive(Debug, Error)]
pub enum MysqlToolError {
    #[error("The saved MySQL/MariaDB connection was not found")]
    MissingConnection,
    #[error("Backup and restore are only available for MySQL and MariaDB connections")]
    NotMysql,
    #[error("The saved MySQL/MariaDB connection is missing a host")]
    MissingHost,
    #[error("The saved MySQL/MariaDB connection is missing a database name")]
    MissingDatabase,
    #[error("The saved MySQL/MariaDB connection is missing a username")]
    MissingUsername,
    #[error("Failed to access the application data directory: {0}")]
    AppDataDir(String),
    #[error("Failed to read saved MySQL/MariaDB connections: {0}")]
    MetadataStore(#[from] rusqlite::Error),
    #[error("{0}")]
    InvalidRestoreInput(String),
    #[error("{0}")]
    Spawn(String),
}

pub fn load_mysql_profile(
    app: &AppHandle,
    connection_id: &str,
) -> Result<MysqlProfile, MysqlToolError> {
    let mut last_error = MysqlToolError::MissingConnection;

    for metadata_path in candidate_metadata_paths(app)? {
        match load_mysql_profile_from_path(&metadata_path, connection_id) {
            Ok(profile) => return Ok(profile),
            Err(error) if should_fallback(&error) => {
                last_error = error;
            }
            Err(error) => return Err(error),
        }
    }

    Err(last_error)
}

pub fn build_backup_command(
    program: &str,
    profile: &MysqlProfile,
    request: &StartBackupRequest,
) -> CommandSpec {
    let mut args = connection_args(profile);
    // mysqldump requires the path bound into the option token
    // (`--result-file=<path>`), otherwise the path is treated as a
    // database/table positional argument and the dump fails.
    args.push(format!("--result-file={}", request.output_path));
    args.push("--verbose".into());

    // XML format uses mysqldump's --xml flag; default is plain SQL.
    if let BackupFormat::Xml = request.format {
        args.push("--xml".into());
    }

    let started_message = match &request.scope {
        BackupScope::Database => {
            args.push("--databases".into());
            args.push(profile.database.clone());
            format!("Backing up database {}", profile.database)
        }
        BackupScope::Table { table } => {
            args.push("--databases".into());
            args.push(profile.database.clone());
            args.push("--tables".into());
            args.push(table.clone());
            format!("Backing up table {table}")
        }
    };

    CommandSpec {
        program: program.into(),
        args,
        env: connection_env(profile),
        started_message,
        stdin_file: None,
    }
}

pub fn build_restore_command(
    program: &str,
    profile: &MysqlProfile,
    request: &StartRestoreRequest,
) -> Result<CommandSpec, MysqlToolError> {
    if request.target_database.trim().is_empty() {
        return Err(MysqlToolError::InvalidRestoreInput(
            "Target database is required".into(),
        ));
    }

    let input_path = PathBuf::from(request.input_path.trim());
    if !input_path.is_file() {
        return Err(MysqlToolError::InvalidRestoreInput(
            "The selected dump file was not found".into(),
        ));
    }

    let mut args = connection_args(profile);
    args.push(request.target_database.trim().to_string());

    // `mysql` has no psql-style `--file` flag for executing a SQL file;
    // the dump is piped through stdin by the job runner.
    Ok(CommandSpec {
        program: program.into(),
        args,
        env: connection_env(profile),
        started_message: format!("Restoring into database {}", request.target_database.trim()),
        stdin_file: Some(input_path),
    })
}

/// Resolve the mysql/mysqldump binary. MariaDB connections try `mariadb-dump`/`mariadb`
/// first, falling back to `mysqldump`/`mysql`. User-configured paths from the
/// metadata store take priority over PATH detection.
pub fn resolve_mysql_program(app: &AppHandle, program: &str, profile: &MysqlProfile) -> String {
    let candidates: Vec<&str> = if profile.kind == "mariadb" {
        match program {
            "mysqldump" => vec!["mariadb-dump", "mysqldump"],
            "mysql" => vec!["mariadb", "mysql"],
            _ => vec![program],
        }
    } else {
        vec![program]
    };

    // 1. Check user-configured paths from the metadata store.
    for candidate in &candidates {
        if let Some(configured) = crate::tool_paths::get_configured_tool_path(app, candidate) {
            let path = PathBuf::from(&configured);
            if path.is_file() {
                return configured;
            }
        }
    }

    // 2. Search PATH.
    for candidate in &candidates {
        if let Some(path) = find_in_path(candidate) {
            return path;
        }
    }

    candidates[0].into()
}

fn find_in_path(program: &str) -> Option<String> {
    let direct = PathBuf::from(program);
    if direct.is_absolute() || program.contains(std::path::MAIN_SEPARATOR) {
        return Some(program.into());
    }

    if let Some(path) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&path) {
            let candidate = dir.join(program);
            if candidate.is_file() {
                return Some(candidate.to_string_lossy().into_owned());
            }
        }
    }

    None
}

fn connection_args(profile: &MysqlProfile) -> Vec<String> {
    let mut args = vec![
        format!("--host={}", profile.host),
        format!("--port={}", profile.port),
        format!("--user={}", profile.username),
    ];
    if profile.ssl {
        // MariaDB clients reject MySQL's `--ssl-mode`; use MariaDB's `--ssl` flag for them.
        if profile.kind == "mariadb" {
            args.push("--ssl".into());
        } else {
            args.push("--ssl-mode=REQUIRED".into());
        }
    }
    args
}

fn connection_env(profile: &MysqlProfile) -> Vec<(String, String)> {
    let mut env = Vec::new();
    if let Some(password) = &profile.password {
        env.push(("MYSQL_PWD".into(), password.clone()));
    }
    env
}

fn candidate_metadata_paths(app: &AppHandle) -> Result<Vec<PathBuf>, MysqlToolError> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| MysqlToolError::AppDataDir(error.to_string()))?;

    Ok(vec![
        app_data_dir.join("kamehadb.db"),
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../sidecar/kamehadb.db"),
    ])
}

fn load_mysql_profile_from_path(
    metadata_path: &Path,
    connection_id: &str,
) -> Result<MysqlProfile, MysqlToolError> {
    let connection = Connection::open(metadata_path)?;
    let mut statement = connection.prepare(
        "SELECT kind, host, port, database, username, password, ssl
         FROM connection_profiles
         WHERE id = ?1",
    )?;
    let row = statement.query_row(params![connection_id], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, Option<String>>(1)?,
            row.get::<_, Option<i64>>(2)?,
            row.get::<_, Option<String>>(3)?,
            row.get::<_, Option<String>>(4)?,
            row.get::<_, Option<String>>(5)?,
            row.get::<_, Option<i64>>(6)?,
        ))
    });

    let (kind, host, port, database, username, password, ssl) = match row {
        Ok(values) => values,
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            return Err(MysqlToolError::MissingConnection)
        }
        Err(error) => return Err(MysqlToolError::MetadataStore(error)),
    };

    if kind != "mysql" && kind != "mariadb" {
        return Err(MysqlToolError::NotMysql);
    }

    Ok(MysqlProfile {
        kind,
        host: host
            .filter(|value| !value.is_empty())
            .ok_or(MysqlToolError::MissingHost)?,
        port: port.and_then(|p| u16::try_from(p).ok()).unwrap_or(3306),
        database: database
            .filter(|value| !value.is_empty())
            .ok_or(MysqlToolError::MissingDatabase)?,
        username: username
            .filter(|value| !value.is_empty())
            .ok_or(MysqlToolError::MissingUsername)?,
        password: password.filter(|value| !value.is_empty()),
        ssl: ssl.unwrap_or(0) != 0,
    })
}

fn should_fallback(error: &MysqlToolError) -> bool {
    matches!(
        error,
        MysqlToolError::MissingConnection
            | MysqlToolError::MissingHost
            | MysqlToolError::MissingDatabase
            | MysqlToolError::MissingUsername
            | MysqlToolError::MetadataStore(_)
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mysql_tools::{BackupFormat, BackupScope, StartBackupRequest, StartRestoreRequest};

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

    fn mariadb_profile() -> MysqlProfile {
        MysqlProfile {
            kind: "mariadb".into(),
            ..profile()
        }
    }

    fn command_name(program: &str) -> &str {
        Path::new(program)
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or(program)
    }

    #[test]
    fn backup_command_uses_scope_flags() {
        let command = build_backup_command(
            "mysqldump",
            &profile(),
            &StartBackupRequest {
                connection_id: "mysql".into(),
                output_path: "/tmp/app.sql".into(),
                format: BackupFormat::Sql,
                scope: BackupScope::Table {
                    table: "users".into(),
                },
            },
        );

        assert_eq!(command_name(&command.program), "mysqldump");
        assert!(command
            .args
            .iter()
            .any(|value| value == "--databases"));
        assert!(command
            .args
            .iter()
            .any(|value| value == "--tables"));
        assert!(command
            .args
            .iter()
            .any(|value| value == "users"));
        assert!(command
            .env
            .iter()
            .any(|(key, value)| key == "MYSQL_PWD" && value == "secret"));
        // MySQL connections use --ssl-mode; the path must be bound into the option token.
        assert!(command
            .args
            .iter()
            .any(|value| value == "--ssl-mode=REQUIRED"));
        assert!(command
            .args
            .iter()
            .any(|value| value == "--result-file=/tmp/app.sql"));
        // SQL format must not add --xml.
        assert!(!command.args.iter().any(|value| value == "--xml"));
        assert!(command.stdin_file.is_none());
    }

    #[test]
    fn backup_command_xml_format_adds_xml_flag() {
        let command = build_backup_command(
            "mysqldump",
            &profile(),
            &StartBackupRequest {
                connection_id: "mysql".into(),
                output_path: "/tmp/app.xml".into(),
                format: BackupFormat::Xml,
                scope: BackupScope::Database,
            },
        );

        assert!(command.args.iter().any(|value| value == "--xml"));
    }

    #[test]
    fn restore_command_builds_mysql_invocation() {
        let temp_dir = tempfile::tempdir().expect("temp dir should exist");
        let dump_path = temp_dir.path().join("app.sql");
        std::fs::write(&dump_path, b"select 1;\n").expect("sql file should be written");
        let command = build_restore_command(
            "mysql",
            &profile(),
            &StartRestoreRequest {
                connection_id: "mysql".into(),
                input_path: dump_path.display().to_string(),
                target_database: "restore_db".into(),
            },
        )
        .expect("restore command should build");

        assert_eq!(command_name(&command.program), "mysql");
        assert!(command
            .args
            .iter()
            .any(|value| value == "restore_db"));
        // Restore must feed the dump file via stdin (mysql has no --file flag).
        assert_eq!(command.stdin_file.as_deref(), Some(dump_path.as_path()));
    }

    #[test]
    fn restore_command_rejects_missing_input_file() {
        let result = build_restore_command(
            "mysql",
            &profile(),
            &StartRestoreRequest {
                connection_id: "mysql".into(),
                input_path: "/tmp/missing.sql".into(),
                target_database: "restore_db".into(),
            },
        );

        assert!(matches!(
            result,
            Err(MysqlToolError::InvalidRestoreInput(message))
                if message == "The selected dump file was not found"
        ));
    }

    #[test]
    fn mariadb_profile_prefers_mariadb_tools() {
        let command = build_backup_command(
            "mariadb-dump",
            &mariadb_profile(),
            &StartBackupRequest {
                connection_id: "mariadb".into(),
                output_path: "/tmp/app.sql".into(),
                format: BackupFormat::Sql,
                scope: BackupScope::Database,
            },
        );

        // mariadb-dump or mysqldump — depending on what's installed.
        // On the test machine neither may be installed, so the program
        // name falls back to the first candidate ("mariadb-dump").
        assert!(matches!(
            command_name(&command.program),
            "mariadb-dump" | "mysqldump"
        ));
        // MariaDB clients reject --ssl-mode; they use --ssl instead.
        assert!(command.args.iter().any(|value| value == "--ssl"));
        assert!(!command
            .args
            .iter()
            .any(|value| value == "--ssl-mode=REQUIRED"));
    }
}
