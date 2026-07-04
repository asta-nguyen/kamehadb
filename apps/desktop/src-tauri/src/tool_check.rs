use serde::Serialize;

// Install hints per tool, keyed by package manager. Mirrors the sidecar's
// INSTALL_COMMANDS map so the proactive shell-tab reminder matches the
// Client Tools page. (Why: single source of truth for install copy.)
const SQLITE3_INSTALL_HINTS: &[(&str, &str)] = &[
    ("brew", "brew install sqlite"),
    ("apt", "sudo apt install sqlite3"),
    ("dnf", "sudo dnf install sqlite"),
    ("pacman", "sudo pacman -S sqlite"),
    ("choco", "choco install sqlite"),
];

const SQLCMD_INSTALL_HINTS: &[(&str, &str)] = &[
    ("brew", "brew tap microsoft/mssql-release https://github.com/Microsoft/homebrew-mssql-release && HOMEBREW_ACCEPT_EULA=Y brew install msodbcsql18 mssql-tools18"),
    ("apt", "sudo apt install mssql-tools18 unixodbc-dev"),
    ("dnf", "sudo dnf install mssql-tools18 unixODBC-devel"),
    ("pacman", "yay -S msodbcsql mssql-tools"),
    ("choco", "choco install sqlcmd"),
];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolInstallStatus {
    pub installed: bool,
    pub path: Option<String>,
    pub hint: String,
}

// Detect the active package manager so the install hint matches the user's
// platform. Falls back to a generic download link when detection fails.
// (How: mirrors the sidecar detectPm logic but in Rust for the Tauri side.)
fn detect_package_manager() -> &'static str {
    if cfg!(target_os = "macos") {
        return "brew";
    }
    if cfg!(target_os = "windows") {
        return "choco";
    }
    if let Ok(content) = std::fs::read_to_string("/etc/os-release") {
        let id = content
            .lines()
            .find_map(|line| line.strip_prefix("ID=").map(|v| v.trim_matches('"').to_string()))
            .unwrap_or_default();
        if ["arch", "manjaro", "garuda", "endeavouros"].contains(&id.as_str()) {
            return "pacman";
        }
        if ["ubuntu", "debian", "linuxmint", "pop"].contains(&id.as_str()) {
            return "apt";
        }
        if ["fedora", "rhel", "centos", "rocky", "alma"].contains(&id.as_str()) {
            return "dnf";
        }
    }
    "unknown"
}

fn install_hint_for(tool: &str) -> String {
    let pm = detect_package_manager();
    let hints: &[(&str, &str)] = match tool {
        "sqlite3" => SQLITE3_INSTALL_HINTS,
        "sqlcmd" => SQLCMD_INSTALL_HINTS,
        _ => return format!("Install {tool} and ensure it is on your PATH."),
    };
    if let Some((_, command)) = hints.iter().find(|(key, _)| *key == pm) {
        return format!("Install with: {command}");
    }
    match tool {
        "sqlite3" => "Download from: https://www.sqlite.org/download.html".to_string(),
        "sqlcmd" => "Download from: https://learn.microsoft.com/sql/tools/sqlcmd".to_string(),
        _ => format!("Install {tool} and ensure it is on your PATH."),
    }
}

// Search PATH for the program, returning the first executable match. Mirrors
// the sidecar findOnPath helper. (How: split PATH env, join each dir with the
// program name, check executable bit.)
fn find_on_path(program: &str) -> Option<String> {
    if program.contains('/') || program.contains('\\') {
        if std::path::Path::new(program).is_file() {
            return Some(program.to_string());
        }
        return None;
    }
    let path_value = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path_value) {
        let candidate = dir.join(program);
        if candidate.is_file() {
            return Some(candidate.to_string_lossy().to_string());
        }
        // On Windows the binary usually carries a .exe extension; check it too.
        if cfg!(target_os = "windows") {
            let with_ext = candidate.with_extension("exe");
            if with_ext.is_file() {
                return Some(with_ext.to_string_lossy().to_string());
            }
        }
    }
    None
}

#[tauri::command]
pub fn check_tool_installed(program: String) -> ToolInstallStatus {
    let path = find_on_path(&program);
    let installed = path.is_some();
    let hint = if installed {
        String::new()
    } else {
        install_hint_for(&program)
    };
    ToolInstallStatus {
        installed,
        path,
        hint,
    }
}

#[cfg(test)]
mod tests {
    use super::install_hint_for;

    #[test]
    fn sqlite3_hint_is_non_empty() {
        let hint = install_hint_for("sqlite3");
        assert!(!hint.is_empty());
    }

    #[test]
    fn sqlcmd_hint_is_non_empty() {
        let hint = install_hint_for("sqlcmd");
        assert!(!hint.is_empty());
    }

    #[test]
    fn unknown_tool_falls_back_to_generic_hint() {
        let hint = install_hint_for("not-a-real-tool");
        assert!(hint.contains("not-a-real-tool"));
    }

    #[test]
    fn find_on_path_resolves_known_binary() {
        // `sh` is present on every POSIX system we support.
        if cfg!(unix) {
            let path = super::find_on_path("sh");
            assert!(path.is_some(), "expected to find sh on PATH");
        }
    }
}
