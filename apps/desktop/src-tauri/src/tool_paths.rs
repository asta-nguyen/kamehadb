use std::path::PathBuf;

use rusqlite::Connection;
use tauri::{AppHandle, Manager};

/// Resolve the candidate metadata database paths, mirroring the pattern used
/// by postgres_tools and mysql_tools. The app data dir is checked first,
/// then the dev-mode sidecar path.
fn candidate_metadata_paths(app: &AppHandle) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Ok(app_data_dir) = app.path().app_data_dir() {
        paths.push(app_data_dir.join("kamehadb.db"));
    }
    paths.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../sidecar/kamehadb.db"));
    paths
}

/// Read a user-configured tool path from the metadata store.
///
/// Returns `Some(path)` if the user has configured a custom binary path for
/// the given tool name (e.g. "psql", "mysqldump"), or `None` if no custom
/// path is set (caller should fall back to PATH/candidate detection).
pub fn get_configured_tool_path(app: &AppHandle, tool: &str) -> Option<String> {
    for metadata_path in candidate_metadata_paths(app) {
        if !metadata_path.is_file() {
            continue;
        }
        let connection = match Connection::open(&metadata_path) {
            Ok(conn) => conn,
            Err(_) => continue,
        };
        let result = connection
            .prepare("SELECT path FROM client_tool_paths WHERE tool = ?1")
            .and_then(|mut stmt| stmt.query_row(rusqlite::params![tool], |row| row.get::<_, String>(0)));
        if let Ok(path) = result {
            if !path.trim().is_empty() {
                return Some(path);
            }
        }
    }
    None
}
