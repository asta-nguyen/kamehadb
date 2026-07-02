use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::{params, Connection, OpenFlags};
use tauri::AppHandle;
use thiserror::Error;

use super::{BackupFormat, BackupScope, StartBackupRequest, StartRestoreRequest};
use crate::connection_profile::resolve_metadata_paths;

#[derive(Clone, Debug)]
pub struct PostgresProfile {
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
}

#[derive(Debug, Error)]
pub enum PostgresToolError {
    #[error("The saved PostgreSQL connection was not found")]
    MissingConnection,
    #[error("Backup and restore are only available for PostgreSQL connections")]
    NotPostgres,
    #[error("The saved PostgreSQL connection is missing a host")]
    MissingHost,
    #[error("The saved PostgreSQL connection is missing a database name")]
    MissingDatabase,
    #[error("The saved PostgreSQL connection is missing a username")]
    MissingUsername,
    #[error("Failed to access the application data directory: {0}")]
    AppDataDir(String),
    #[error("Failed to read saved PostgreSQL connections: {0}")]
    MetadataStore(#[from] rusqlite::Error),
    #[error("{0}")]
    InvalidRestoreInput(String),
    #[error("{0}")]
    Spawn(String),
}

pub fn load_postgres_profile(
    app: &AppHandle,
    connection_id: &str,
) -> Result<PostgresProfile, PostgresToolError> {
    let mut last_error = PostgresToolError::MissingConnection;

    for metadata_path in resolve_metadata_paths(app).map_err(PostgresToolError::AppDataDir)? {
        match load_postgres_profile_from_path(&metadata_path, connection_id) {
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
    profile: &PostgresProfile,
    request: &StartBackupRequest,
) -> CommandSpec {
    let mut args = connection_args(profile, &profile.database);
    args.push("--verbose".into());
    args.push("--no-password".into());
    args.push(format!("--file={}", request.output_path));
    args.push(format!("--format={}", backup_format_arg(&request.format)));

    let started_message = match &request.scope {
        BackupScope::Database => format!("Backing up database {}", profile.database),
        BackupScope::Schema { schema } => {
            args.push(format!("--schema={}", identifier_pattern(schema)));
            format!("Backing up schema {schema}")
        }
        BackupScope::Table { schema, table } => {
            args.push(format!(
                "--table={}",
                qualified_identifier_pattern(schema, table)
            ));
            format!("Backing up table {schema}.{table}")
        }
    };

    CommandSpec {
        program: resolve_postgres_program("pg_dump"),
        args,
        env: connection_env(profile),
        started_message,
    }
}

pub fn build_restore_command(
    profile: &PostgresProfile,
    request: &StartRestoreRequest,
) -> Result<CommandSpec, PostgresToolError> {
    if request.target_database.trim().is_empty() {
        return Err(PostgresToolError::InvalidRestoreInput(
            "Target database is required".into(),
        ));
    }

    let input_path = PathBuf::from(request.input_path.trim());
    if !input_path.is_file() {
        return Err(PostgresToolError::InvalidRestoreInput(
            "The selected dump file was not found".into(),
        ));
    }
    let program = restore_program(&input_path);
    let mut args = connection_args(profile, request.target_database.trim());
    args.push("--no-password".into());

    if program == "psql" {
        args.push("--echo-errors".into());
        args.push("-v".into());
        args.push("ON_ERROR_STOP=1".into());
        args.push(format!("--file={}", input_path.display()));
    } else {
        args.push("--verbose".into());
        if request.clean {
            args.push("--clean".into());
            args.push("--if-exists".into());
        }
        args.push(input_path.display().to_string());
    }

    Ok(CommandSpec {
        program: resolve_postgres_program(program),
        args,
        env: connection_env(profile),
        started_message: format!("Restoring into database {}", request.target_database.trim()),
    })
}

pub fn resolve_postgres_program(program: &str) -> String {
    let direct = PathBuf::from(program);
    if direct.is_absolute() || program.contains(std::path::MAIN_SEPARATOR) {
        return program.into();
    }

    if let Some(path) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&path) {
            let candidate = dir.join(program);
            if candidate.is_file() {
                return candidate.to_string_lossy().into_owned();
            }
        }
    }

    for candidate in postgres_program_candidates(program) {
        if candidate.is_file() {
            return candidate.to_string_lossy().into_owned();
        }
    }

    program.into()
}

fn connection_args(profile: &PostgresProfile, database: &str) -> Vec<String> {
    vec![
        format!("--host={}", profile.host),
        format!("--port={}", profile.port),
        format!("--username={}", profile.username),
        format!("--dbname={database}"),
    ]
}

fn connection_env(profile: &PostgresProfile) -> Vec<(String, String)> {
    let mut env = Vec::new();
    if let Some(password) = &profile.password {
        env.push(("PGPASSWORD".into(), password.clone()));
    }
    if profile.ssl {
        env.push(("PGSSLMODE".into(), "require".into()));
    }
    env
}

fn backup_format_arg(format: &BackupFormat) -> &'static str {
    match format {
        BackupFormat::Plain => "plain",
        BackupFormat::Custom => "custom",
        BackupFormat::Tar => "tar",
    }
}

fn restore_program(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .as_deref()
    {
        Some("sql") | Some("psql") => "psql",
        _ => "pg_restore",
    }
}

fn postgres_program_candidates(program: &str) -> Vec<PathBuf> {
    let mut candidates = vec![
        PathBuf::from(format!("/opt/homebrew/bin/{program}")),
        PathBuf::from(format!("/usr/local/bin/{program}")),
        PathBuf::from(format!(
            "/Applications/Postgres.app/Contents/Versions/latest/bin/{program}"
        )),
    ];

    candidates.extend(versioned_postgres_bin_dirs("/opt/homebrew/opt").into_iter().map(|dir| dir.join(program)));
    candidates.extend(versioned_postgres_bin_dirs("/usr/local/opt").into_iter().map(|dir| dir.join(program)));
    candidates.extend(postgres_app_bin_dirs().into_iter().map(|dir| dir.join(program)));
    candidates
}

fn versioned_postgres_bin_dirs(root: &str) -> Vec<PathBuf> {
    let Ok(entries) = fs::read_dir(root) else {
        return Vec::new();
    };

    let mut dirs: Vec<(PathBuf, Vec<u32>)> = entries
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            path.file_name()
                .and_then(|value| value.to_str())
                .is_some_and(|name| name.starts_with("postgresql"))
        })
        .map(|path| {
            let version = path
                .file_name()
                .and_then(|v| v.to_str())
                .and_then(|name| name.strip_prefix("postgresql@"))
                .and_then(|v| {
                    let nums: Vec<u32> = v.split('.').filter_map(|s| s.parse().ok()).collect();
                    (!nums.is_empty()).then_some(nums)
                })
                .unwrap_or_default();
            (path.join("bin"), version)
        })
        .collect();

    dirs.sort_by(|a, b| b.1.cmp(&a.1));
    dirs.into_iter().map(|(path, _)| path).collect()
}

fn postgres_app_bin_dirs() -> Vec<PathBuf> {
    let versions_dir = PathBuf::from("/Applications/Postgres.app/Contents/Versions");
    let Ok(entries) = fs::read_dir(&versions_dir) else {
        return Vec::new();
    };

    let mut dirs: Vec<(PathBuf, Vec<u32>)> = entries
        .filter_map(Result::ok)
        .map(|entry| {
            let path = entry.path();
            let version = path
                .file_name()
                .and_then(|v| v.to_str())
                .and_then(|name| {
                    let nums: Vec<u32> = name.split('.').filter_map(|s| s.parse().ok()).collect();
                    (!nums.is_empty()).then_some(nums)
                })
                .unwrap_or_default();
            (path.join("bin"), version)
        })
        .collect();

    dirs.sort_by(|a, b| b.1.cmp(&a.1));
    dirs.into_iter().map(|(path, _)| path).collect()
}

fn qualified_identifier_pattern(schema: &str, table: &str) -> String {
    format!(
        "{}.{}",
        identifier_pattern(schema),
        identifier_pattern(table)
    )
}

fn identifier_pattern(value: &str) -> String {
    format!("\"{}\"", value.replace('"', "\"\""))
}

fn load_postgres_profile_from_path(
    metadata_path: &Path,
    connection_id: &str,
) -> Result<PostgresProfile, PostgresToolError> {
    let connection = Connection::open_with_flags(metadata_path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
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
            return Err(PostgresToolError::MissingConnection)
        }
        Err(error) => return Err(PostgresToolError::MetadataStore(error)),
    };

    if kind != "postgres" {
        return Err(PostgresToolError::NotPostgres);
    }

    Ok(PostgresProfile {
        host: host
            .filter(|value| !value.is_empty())
            .ok_or(PostgresToolError::MissingHost)?,
        port: port.and_then(|p| u16::try_from(p).ok()).unwrap_or(5432),
        database: database
            .filter(|value| !value.is_empty())
            .ok_or(PostgresToolError::MissingDatabase)?,
        username: username
            .filter(|value| !value.is_empty())
            .ok_or(PostgresToolError::MissingUsername)?,
        password: password.filter(|value| !value.is_empty()),
        ssl: ssl.unwrap_or(0) != 0,
    })
}

fn should_fallback(error: &PostgresToolError) -> bool {
    matches!(
        error,
        PostgresToolError::MissingConnection
            | PostgresToolError::MissingHost
            | PostgresToolError::MissingDatabase
            | PostgresToolError::MissingUsername
            | PostgresToolError::MetadataStore(_)
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::postgres_tools::{
        BackupFormat, BackupScope, StartBackupRequest, StartRestoreRequest,
    };

    fn command_name(program: &str) -> &str {
        Path::new(program)
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or(program)
    }

    fn profile() -> PostgresProfile {
        PostgresProfile {
            host: "localhost".into(),
            port: 5432,
            database: "app".into(),
            username: "kameha".into(),
            password: Some("secret".into()),
            ssl: true,
        }
    }

    #[test]
    fn backup_command_uses_scope_flags() {
        let command = build_backup_command(
            &profile(),
            &StartBackupRequest {
                connection_id: "pg".into(),
                output_path: "/tmp/app.dump".into(),
                format: BackupFormat::Custom,
                scope: BackupScope::Table {
                    schema: "public".into(),
                    table: "users".into(),
                },
            },
        );

        assert_eq!(command_name(&command.program), "pg_dump");
        assert!(command
            .args
            .iter()
            .any(|value| value == "--table=\"public\".\"users\""));
        assert!(command.args.iter().any(|value| value == "--format=custom"));
        assert!(command.env.iter().any(|(key, _)| key == "PGPASSWORD"));
        assert!(command
            .env
            .iter()
            .any(|(key, value)| key == "PGSSLMODE" && value == "require"));
    }

    #[test]
    fn restore_command_uses_psql_for_sql_files() {
        let temp_dir = tempfile::tempdir().expect("temp dir should exist");
        let dump_path = temp_dir.path().join("app.sql");
        std::fs::write(&dump_path, b"select 1;\n").expect("sql file should be written");
        let command = build_restore_command(
            &profile(),
            &StartRestoreRequest {
                connection_id: "pg".into(),
                input_path: dump_path.display().to_string(),
                target_database: "restore_db".into(),
                clean: false,
            },
        )
        .expect("restore command should build");

        assert_eq!(command_name(&command.program), "psql");
        assert!(command
            .args
            .iter()
            .any(|value| value == "--dbname=restore_db"));
        assert!(command
            .args
            .iter()
            .any(|value| value == &format!("--file={}", dump_path.display())));
    }

    #[test]
    fn restore_command_uses_pg_restore_for_archive_files() {
        let temp_dir = tempfile::tempdir().expect("temp dir should exist");
        let dump_path = temp_dir.path().join("app.dump");
        std::fs::write(&dump_path, b"PGDMP").expect("dump file should be written");
        let command = build_restore_command(
            &profile(),
            &StartRestoreRequest {
                connection_id: "pg".into(),
                input_path: dump_path.display().to_string(),
                target_database: "restore_db".into(),
                clean: true,
            },
        )
        .expect("restore command should build");

        assert_eq!(command_name(&command.program), "pg_restore");
        assert!(command.args.iter().any(|value| value == "--clean"));
        assert!(command.args.iter().any(|value| value == "--if-exists"));
    }

    #[test]
    fn restore_command_rejects_missing_input_file() {
        let result = build_restore_command(
            &profile(),
            &StartRestoreRequest {
                connection_id: "pg".into(),
                input_path: "/tmp/missing.dump".into(),
                target_database: "restore_db".into(),
                clean: false,
            },
        );

        assert!(matches!(
            result,
            Err(PostgresToolError::InvalidRestoreInput(message))
                if message == "The selected dump file was not found"
        ));
    }

    #[test]
    fn backup_command_quotes_table_patterns() {
        let command = build_backup_command(
            &profile(),
            &StartBackupRequest {
                connection_id: "pg".into(),
                output_path: "/tmp/app.dump".into(),
                format: BackupFormat::Custom,
                scope: BackupScope::Table {
                    schema: "public-data".into(),
                    table: "user events".into(),
                },
            },
        );

        assert!(command
            .args
            .iter()
            .any(|value| value == "--table=\"public-data\".\"user events\""));
    }
}
