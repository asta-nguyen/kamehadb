use anyhow::{Context, Result};
use rusqlite::Connection;
use std::convert::TryFrom;
use std::fs;
use tauri::Manager;

#[derive(Clone, Debug)]
pub struct PostgresProfile {
    pub host: String,
    pub port: u16,
    pub database: String,
    pub username: String,
    pub password: Option<String>,
    pub ssl: bool,
}

pub fn load_postgres_profile(
    app: &tauri::AppHandle,
    connection_id: &str,
) -> Result<PostgresProfile> {
    let db_path = app
        .path()
        .app_data_dir()
        .context("Failed to resolve the app data directory")?
        .join("kamehadb.db");
    if let Some(parent) = db_path.parent() {
        fs::create_dir_all(parent).with_context(|| {
            format!(
                "Failed to create the app data directory at {}",
                parent.display()
            )
        })?;
    }

    let conn = Connection::open(&db_path)
        .with_context(|| format!("Failed to open metadata database at {}", db_path.display()))?;

    let profile = conn
        .query_row(
            r#"
            SELECT host, port, database, username, password, ssl
            FROM connection_profiles
            WHERE id = ?1 AND kind = 'postgres'
            "#,
            [connection_id],
            |row| {
                let host: Option<String> = row.get(0)?;
                let port: Option<i64> = row.get(1)?;
                let database: Option<String> = row.get(2)?;
                let username: Option<String> = row.get(3)?;
                let password: Option<String> = row.get(4)?;
                let ssl: Option<i64> = row.get(5)?;

                Ok(PostgresProfile {
                    host: host.unwrap_or_else(|| "localhost".into()),
                    port: u16::try_from(port.unwrap_or(5432)).unwrap_or(5432),
                    database: database.unwrap_or_else(|| "postgres".into()),
                    username: username.unwrap_or_else(|| "postgres".into()),
                    password,
                    ssl: ssl.unwrap_or(0) != 0,
                })
            },
        )
        .with_context(|| format!("PostgreSQL connection {connection_id} was not found"))?;

    Ok(profile)
}
