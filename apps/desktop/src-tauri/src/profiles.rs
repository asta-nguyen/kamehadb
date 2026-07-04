use std::path::{Path, PathBuf};

use rusqlite::{params, Connection};
use tauri::{AppHandle, Manager};
use thiserror::Error;

#[derive(Clone, Debug)]
pub struct ConnectionProfile {
    pub kind: String,
    pub host: Option<String>,
    pub port: Option<u16>,
    pub database: Option<String>,
    pub username: Option<String>,
    pub password: Option<String>,
    pub ssl: bool,
    pub file_path: Option<String>,
}

#[derive(Debug, Error)]
pub enum ProfileError {
    #[error("The saved connection was not found")]
    MissingConnection,
    #[error("The saved connection has an invalid port: {0}")]
    InvalidPort(i64),
    #[error("The saved SQLite connection is missing a file path")]
    MissingSqliteFilePath,
    #[error("Failed to access the application data directory: {0}")]
    AppDataDir(String),
    #[error("Failed to read saved connections: {0}")]
    MetadataStore(#[from] rusqlite::Error),
}

pub fn load_profile(app: &AppHandle, connection_id: &str) -> Result<ConnectionProfile, ProfileError> {
    let mut last_error = ProfileError::MissingConnection;

    for metadata_path in candidate_metadata_paths(app)? {
        match load_profile_from_path(&metadata_path, connection_id) {
            Ok(profile) => return Ok(profile),
            Err(error) if should_fallback(&error) => {
                last_error = error;
            }
            Err(error) => return Err(error),
        }
    }

    Err(last_error)
}

fn candidate_metadata_paths(app: &AppHandle) -> Result<Vec<PathBuf>, ProfileError> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| ProfileError::AppDataDir(error.to_string()))?;

    Ok(vec![
        app_data_dir.join("kamehadb.db"),
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../sidecar/kamehadb.db"),
    ])
}

fn load_profile_from_path(
    metadata_path: &Path,
    connection_id: &str,
) -> Result<ConnectionProfile, ProfileError> {
    let connection = Connection::open(metadata_path)?;
    let mut statement = connection.prepare(
        "SELECT kind, host, port, database, username, password, ssl, file_path
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
            row.get::<_, Option<String>>(7)?,
        ))
    });

    let (kind, host, port, database, username, password, ssl, file_path) = match row {
        Ok(values) => values,
        Err(rusqlite::Error::QueryReturnedNoRows) => return Err(ProfileError::MissingConnection),
        Err(error) => return Err(ProfileError::MetadataStore(error)),
    };

    let port = match port {
        Some(value) => Some(u16::try_from(value).map_err(|_| ProfileError::InvalidPort(value))?),
        None => None,
    };

    Ok(ConnectionProfile {
        kind,
        host,
        port,
        database,
        username: username.filter(|value| !value.is_empty()),
        password: password.filter(|value| !value.is_empty()),
        ssl: ssl.unwrap_or(0) != 0,
        file_path,
    })
}

fn should_fallback(error: &ProfileError) -> bool {
    matches!(
        error,
        ProfileError::MissingConnection | ProfileError::MetadataStore(_)
    )
}
