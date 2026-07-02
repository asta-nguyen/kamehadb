use std::path::PathBuf;

use rusqlite::{params, Connection, OpenFlags};
use tauri::{AppHandle, Manager};
use thiserror::Error;

/// The subset of connection profile fields needed to build CLI tool commands.
#[derive(Clone, Debug)]
pub struct ConnectionProfile {
    pub host: Option<String>,
    pub port: Option<u16>,
    pub database: Option<String>,
    pub username: Option<String>,
    pub password: Option<String>,
    /// File path for file-backed databases (SQLite, DuckDB).
    pub file_path: Option<String>,
}

/// Which kind of engine is expected for the connection.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ConnectionKind {
    Oracle,
    Clickhouse,
    Duckdb,
}

impl ConnectionKind {
    fn as_str(self) -> &'static str {
        match self {
            ConnectionKind::Oracle => "oracle",
            ConnectionKind::Clickhouse => "clickhouse",
            ConnectionKind::Duckdb => "duckdb",
        }
    }

    fn label(self) -> &'static str {
        match self {
            ConnectionKind::Oracle => "Oracle",
            ConnectionKind::Clickhouse => "ClickHouse",
            ConnectionKind::Duckdb => "DuckDB",
        }
    }
}

#[derive(Debug, Error)]
pub enum ConnectionProfileError {
    #[error("The saved connection was not found")]
    MissingConnection,
    #[error("Shell is only available for {0} connections")]
    WrongKind(String),
    #[error("The saved connection has an invalid port: {0}")]
    InvalidPort(i64),
    #[error("Failed to access the application data directory: {0}")]
    AppDataDir(String),
    #[error("Failed to read saved connections: {0}")]
    MetadataStore(#[from] rusqlite::Error),
}

pub fn load_connection_profile(
    app: &AppHandle,
    connection_id: &str,
    expected_kind: ConnectionKind,
) -> Result<ConnectionProfile, ConnectionProfileError> {
    let mut last_error = ConnectionProfileError::MissingConnection;

    for path in candidate_metadata_paths(app)? {
        match load_from_path(&path, connection_id, expected_kind) {
            Ok(profile) => return Ok(profile),
            Err(error) if should_fallback(&error) => {
                last_error = error;
            }
            Err(error) => return Err(error),
        }
    }

    Err(last_error)
}

fn load_from_path(
    path: &std::path::Path,
    connection_id: &str,
    expected_kind: ConnectionKind,
) -> Result<ConnectionProfile, ConnectionProfileError> {
    let conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    let mut stmt = conn.prepare(
        "SELECT kind, host, port, database, username, password, file_path
         FROM connection_profiles
         WHERE id = ?1",
    )?;
    let row = stmt.query_row(params![connection_id], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, Option<String>>(1)?,
            row.get::<_, Option<i64>>(2)?,
            row.get::<_, Option<String>>(3)?,
            row.get::<_, Option<String>>(4)?,
            row.get::<_, Option<String>>(5)?,
            row.get::<_, Option<String>>(6)?,
        ))
    });

    let (kind, host, port, database, username, password, file_path) = match row {
        Ok(values) => values,
        Err(rusqlite::Error::QueryReturnedNoRows) => return Err(ConnectionProfileError::MissingConnection),
        Err(error) => return Err(ConnectionProfileError::MetadataStore(error)),
    };

    if kind != expected_kind.as_str() {
        return Err(ConnectionProfileError::WrongKind(expected_kind.label().into()));
    }

    let port = match port {
        Some(value) => Some(u16::try_from(value).map_err(|_| ConnectionProfileError::InvalidPort(value))?),
        None => None,
    };

    Ok(ConnectionProfile {
        host: host.filter(|v| !v.is_empty()),
        port,
        database: database.filter(|v| !v.is_empty()),
        username: username.filter(|v| !v.is_empty()),
        password: password.filter(|v| !v.is_empty()),
        file_path: file_path.filter(|v| !v.is_empty()),
    })
}

fn should_fallback(error: &ConnectionProfileError) -> bool {
    matches!(
        error,
        ConnectionProfileError::MissingConnection | ConnectionProfileError::MetadataStore(_)
    )
}

pub fn resolve_metadata_paths(app: &AppHandle) -> Result<Vec<PathBuf>, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;

    Ok(vec![
        app_data_dir.join("kamehadb.db"),
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../sidecar/kamehadb.db"),
    ])
}

pub fn candidate_metadata_paths(app: &AppHandle) -> Result<Vec<PathBuf>, ConnectionProfileError> {
    resolve_metadata_paths(app).map_err(ConnectionProfileError::AppDataDir)
}

/// Resolve a CLI tool binary path, checking the client_tool_paths table first,
/// then falling back to PATH search and common install locations.
pub fn resolve_client_tool(app: &AppHandle, tool: &str) -> String {
    // 1. Check client_tool_paths table in metadata DB
    if let Ok(paths) = candidate_metadata_paths(app) {
        for db_path in &paths {
            if let Ok(conn) = Connection::open_with_flags(db_path, OpenFlags::SQLITE_OPEN_READ_ONLY) {
                if let Ok(configured) = conn.query_row(
                    "SELECT path FROM client_tool_paths WHERE tool = ?1",
                    params![tool],
                    |row| row.get::<_, String>(0),
                ) {
                    if !configured.is_empty() {
                        return configured;
                    }
                }
            }
        }
    }

    // 2. Search PATH
    if let Some(path) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&path) {
            let candidate = dir.join(tool);
            if candidate.is_file() {
                return candidate.to_string_lossy().into_owned();
            }
        }
    }

    // 3. Fall back to bare name
    tool.into()
}
