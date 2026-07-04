use serde::Serialize;
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

// Result of a proactive CLI tool presence check, surfaced to the frontend so it
// can show a "tool not installed" reminder before attempting to spawn a shell.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolInstallCheck {
    pub installed: bool,
    pub path: Option<String>,
    pub hint: String,
}

/// Check whether a CLI binary is available before launching a shell session.
/// User-configured paths take priority, then a PATH search, mirroring
/// `resolve_mysql_program` so the reminder matches what would actually spawn.
#[tauri::command]
pub fn check_tool_installed(app: AppHandle, program: String) -> ToolInstallCheck {
    if let Some(configured) = get_configured_tool_path(&app, &program) {
        if PathBuf::from(&configured).is_file() {
            return ToolInstallCheck {
                installed: true,
                path: Some(configured),
                hint: String::new(),
            };
        }
    }

    if let Some(path) = find_in_path(&program) {
        return ToolInstallCheck {
            installed: true,
            path: Some(path),
            hint: String::new(),
        };
    }

    ToolInstallCheck {
        installed: false,
        path: None,
        hint: install_hint(&program),
    }
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

/// Detect the host package manager so install hints match the user's platform.
/// Mirrors the sidecar's `detectPm` logic (`apps/sidecar/src/routes/client-tools.ts`).
fn detect_pm() -> &'static str {
    if cfg!(target_os = "macos") {
        return "brew";
    }
    if cfg!(target_os = "windows") {
        return "choco";
    }

    if let Ok(content) = std::fs::read_to_string("/etc/os-release") {
        let id = content
            .lines()
            .find_map(|line| line.strip_prefix("ID=").map(|v| v.trim_matches('"')))
            .unwrap_or("");
        if matches!(
            id,
            "arch" | "manjaro" | "garuda" | "endeavouros"
        ) {
            return "pacman";
        }
        if matches!(id, "ubuntu" | "debian" | "linuxmint" | "pop") {
            return "apt";
        }
        if matches!(id, "fedora" | "rhel" | "centos" | "rocky" | "alma") {
            return "dnf";
        }
    }

    "unknown"
}

/// Build a platform-specific install hint for a missing CLI tool, matching the
/// install commands advertised by the Client Tools page.
fn install_hint(program: &str) -> String {
    let pm = detect_pm();
    let command = match program {
        "mariadb" => match pm {
            "pacman" => Some("sudo pacman -S mariadb-clients"),
            "apt" => Some("sudo apt install mariadb-client"),
            "dnf" => Some("sudo dnf install mariadb"),
            "brew" => Some("brew install mariadb-client"),
            "choco" => Some("choco install mariadb"),
            _ => None,
        },
        "mysql" => match pm {
            "pacman" => Some("sudo pacman -S mariadb-clients"),
            "apt" => Some("sudo apt install default-mysql-client"),
            "dnf" => Some("sudo dnf install mariadb"),
            "brew" => Some("brew install mysql-client"),
            "choco" => Some("choco install mysql-cli"),
            _ => None,
        },
        _ => None,
    };

    match command {
        Some(cmd) => format!("Install with: {cmd}"),
        None => format!("Install the {program} client tools and try again."),
    }
}

#[cfg(test)]
mod tests {
    use super::{detect_pm, install_hint};

    #[test]
    fn install_hint_for_mysql_references_client_package() {
        let hint = install_hint("mysql");
        // On a recognized package manager the hint is prefixed; on unknown PMs
        // it falls back to a generic message that still names the tool.
        if detect_pm() != "unknown" {
            assert!(
                hint.starts_with("Install with:"),
                "hint should be prefixed with 'Install with:' on a recognized PM"
            );
        }
        assert!(
            hint.contains("mysql") || hint.contains("mariadb"),
            "hint should reference the mysql/mariadb package"
        );
    }

    #[test]
    fn install_hint_for_mariadb_references_client_package() {
        let hint = install_hint("mariadb");
        if detect_pm() != "unknown" {
            assert!(hint.starts_with("Install with:"));
        }
        assert!(hint.contains("mariadb"));
    }

    #[test]
    fn install_hint_falls_back_for_unknown_tool() {
        let hint = install_hint("some-unknown-tool");
        assert!(hint.contains("some-unknown-tool"));
        assert!(!hint.starts_with("Install with:"));
    }
}
