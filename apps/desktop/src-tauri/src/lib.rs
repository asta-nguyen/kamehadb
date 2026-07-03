use keyring::Entry;
use serde::Serialize;
use std::fs;
use std::io::{BufRead, BufReader, Read};
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStderr, ChildStdout, Command};
use std::sync::Mutex;
use std::thread;
use tauri::Manager;

mod app_logs;
mod postgres_psql;
mod postgres_tools;
mod terminal_sessions;

use app_logs::{append_frontend_log, append_tauri_log, clear_app_logs, read_app_logs};
use postgres_psql::start_postgres_psql_session;
use postgres_tools::{
    cancel_postgres_job, start_postgres_backup, start_postgres_restore, PostgresJobState,
};
use terminal_sessions::{
    resize_terminal_session, stop_terminal_session, write_terminal_session, TerminalSessionState,
};

const AUTO_ASSIGN_PORT: u16 = 0;
const SIDECAR_HOST: &str = "127.0.0.1";
const MAX_SUPPORTED_NODE_MAJOR: u32 = 22;
const NODE_ABI_FILE: &str = "node-abi.txt";
#[cfg(windows)]
const BUNDLED_NODE_PATH: &str = "node/bin/node.exe";
#[cfg(not(windows))]
const BUNDLED_NODE_PATH: &str = "node/bin/node";

struct SidecarProcess {
    child: Child,
    port: u16,
}

struct SidecarState(Mutex<Option<SidecarProcess>>);

#[derive(Serialize)]
struct SidecarInfo {
    port: u16,
    pid: u32,
}

#[tauri::command]
fn get_app_data_dir(app: tauri::AppHandle) -> Result<String, String> {
    let path = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

fn find_node(required_abi: Option<&str>, bundled_node: Option<PathBuf>) -> Option<String> {
    // Prefer the bundled Node runtime so release builds do not depend on the
    // user's shell setup, then fall back to common local installs for dev.
    let mut candidates = bundled_node.into_iter().collect::<Vec<_>>();
    candidates.extend([
        PathBuf::from("/usr/local/bin/node"),
        PathBuf::from("/opt/homebrew/bin/node"),
        PathBuf::from("/usr/bin/node"),
    ]);
    candidates.extend(version_manager_node_candidates());

    let mut fallback: Option<String> = None;
    for path in candidates {
        if !path.exists() {
            continue;
        }
        let Some(path_string) = path.to_str().map(str::to_string) else {
            continue;
        };
        if let Some(required) = required_abi {
            if node_abi_version(&path_string).as_deref() == Some(required) {
                return Some(path_string);
            }
            continue;
        }
        match node_major_version(&path_string) {
            Some(major) if major <= MAX_SUPPORTED_NODE_MAJOR => return Some(path_string),
            Some(_) if fallback.is_none() => fallback = Some(path_string),
            _ => {}
        }
    }
    // Fall back to PATH lookup if no preferred runtime was found.
    let path_node = which::which("node")
        .ok()
        .map(|p| p.to_string_lossy().to_string());
    if let Some(required) = required_abi {
        return path_node.filter(|node| node_abi_version(node).as_deref() == Some(required));
    }
    match path_node.as_deref().and_then(node_major_version) {
        Some(major) if major <= MAX_SUPPORTED_NODE_MAJOR => path_node,
        _ => fallback.or(path_node),
    }
}

fn version_manager_node_candidates() -> Vec<PathBuf> {
    let home = std::env::var_os("HOME")
        .map(PathBuf::from)
        .filter(|path| path.exists());
    let Some(home) = home else {
        return Vec::new();
    };

    let mut candidates = Vec::new();
    candidates.extend(glob_child_nodes(&home.join(".nvm/versions/node")));
    candidates.extend(glob_child_nodes(&home.join(".volta/tools/image/node")));
    candidates.extend(glob_child_nodes(&home.join(".asdf/installs/nodejs")));
    candidates
}

fn glob_child_nodes(root: &Path) -> Vec<PathBuf> {
    let Ok(entries) = fs::read_dir(root) else {
        return Vec::new();
    };
    entries
        .filter_map(Result::ok)
        .map(|entry| entry.path().join("bin/node"))
        .filter(|path| path.exists())
        .collect()
}

fn node_major_version(node_path: &str) -> Option<u32> {
    let output = Command::new(node_path).arg("-v").output().ok()?;
    if !output.status.success() {
        return None;
    }
    let version = String::from_utf8_lossy(&output.stdout);
    version
        .trim()
        .trim_start_matches('v')
        .split('.')
        .next()?
        .parse::<u32>()
        .ok()
}

fn node_abi_version(node_path: &str) -> Option<String> {
    let output = Command::new(node_path)
        .args(["-p", "process.versions.modules"])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn resolve_sidecar_root(resource_dir: &Path) -> Result<PathBuf, String> {
    let candidates = [
        resource_dir.join("sidecar"),
        resource_dir.join("resources").join("sidecar"),
    ];
    candidates
        .into_iter()
        .find(|path| path.join("dist").join("index.js").exists())
        .ok_or_else(|| format!("Bundled sidecar not found under {}", resource_dir.display()))
}

#[tauri::command]
async fn start_sidecar(
    app: tauri::AppHandle,
    state: tauri::State<'_, SidecarState>,
) -> Result<SidecarInfo, String> {
    // Reuse the existing sidecar when it's still alive so every caller gets
    // the same runtime port. If the process already exited, drop the stale
    // handle here and let the normal startup path replace it.
    {
        let mut guard = state.0.lock().map_err(|e| e.to_string())?;
        if let Some(process) = guard.as_mut() {
            match process.child.try_wait().map_err(|e| e.to_string())? {
                None => {
                    append_tauri_log(
                        &app,
                        "info",
                        "sidecar",
                        "Sidecar already running, skipping start",
                        None,
                    );
                    return Ok(SidecarInfo {
                        port: process.port,
                        pid: process.child.id(),
                    });
                }
                Some(status) => {
                    append_tauri_log(
                        &app,
                        "warn",
                        "sidecar",
                        "Discarding stale sidecar handle before restart",
                        Some(format!("status={status}")),
                    );
                    *guard = None;
                }
            }
        }
    }

    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;

    let resource_dir = app.path().resource_dir().map_err(|e| e.to_string())?;
    let sidecar_root = resolve_sidecar_root(&resource_dir)?;
    let required_node_abi = std::fs::read_to_string(sidecar_root.join(NODE_ABI_FILE))
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let sidecar_path = sidecar_root.join("dist").join("index.js");

    let bundled_node = Some(sidecar_root.join(BUNDLED_NODE_PATH));
    let node_bin = find_node(required_node_abi.as_deref(), bundled_node).ok_or_else(|| {
        let msg = if let Some(required) = required_node_abi.as_deref() {
            format!("Bundled Node.js with ABI {required} not found. Rebuild the app bundle.")
        } else {
            "Node.js not found. Please install Node.js (https://nodejs.org) to use KamehaDB."
                .to_string()
        };
        append_tauri_log(&app, "error", "sidecar", &msg, None);
        msg
    })?;
    if matches!(node_major_version(&node_bin), Some(major) if major > MAX_SUPPORTED_NODE_MAJOR) {
        let msg = format!(
            "Unsupported Node.js runtime at {node_bin}. Install Node.js 20 or 22, or expose one via nvm/asdf/volta."
        );
        append_tauri_log(&app, "error", "sidecar", &msg, None);
        return Err(msg);
    }

    append_tauri_log(
        &app,
        "info",
        "sidecar",
        &format!("Using Node: {}", node_bin),
        None,
    );
    append_tauri_log(
        &app,
        "info",
        "sidecar",
        &format!("Sidecar path: {}", sidecar_path.display()),
        None,
    );

    let requested_port = allocate_sidecar_port(&app)?;
    let sidecar_arg = sidecar_path.to_string_lossy().replace('\\', "/");
    let mut child = Command::new(&node_bin)
        .arg(&sidecar_arg)
        .env("KAMEHADB_DATA_DIR", data_dir.to_string_lossy().to_string())
        .env("PORT", requested_port.to_string())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| {
            let message = format!("Failed to start sidecar: {}", e);
            append_tauri_log(&app, "error", "sidecar", &message, None);
            message
        })?;

    let pid = child.id();

    // Read stdout to find the port line: KAMEHADB_SIDECAR_PORT=<port>
    let stderr = child.stderr.take();
    let stdout = child.stdout.take();
    let port = if let Some(stdout) = stdout {
        let mut reader = BufReader::new(stdout);
        let mut found_port: Option<u16> = None;
        let mut last_stdout_line: Option<String> = None;
        let mut line = String::new();
        loop {
            line.clear();
            match reader.read_line(&mut line) {
                Ok(0) => break,
                Ok(_) => {
                    let trimmed = line.trim_end().to_string();
                    if trimmed.starts_with("KAMEHADB_SIDECAR_PORT=") {
                        let port_str = &trimmed["KAMEHADB_SIDECAR_PORT=".len()..];
                        if let Ok(port) = port_str.trim().parse::<u16>() {
                            found_port = Some(port);
                            break;
                        }
                    } else {
                        last_stdout_line = Some(trimmed);
                    }
                }
                Err(_) => break,
            }
        }
        if let Some(port) = found_port {
            drain_child_stdout(reader);
            if let Some(stderr) = stderr {
                drain_child_stderr(stderr);
            }
            port
        } else {
            let status = child.wait().ok();
            let details = last_stdout_line.unwrap_or_else(|| "no stdout from sidecar".to_string());
            let stderr_details = read_child_stderr(stderr);
            let message = format!(
                "Sidecar exited before reporting its port: status={status:?}; last_stdout={details}; stderr={stderr_details}"
            );
            append_tauri_log(&app, "error", "sidecar", &message, None);
            return Err(message);
        }
    } else {
        let message = "Sidecar stdout was unavailable, cannot detect runtime port".to_string();
        append_tauri_log(&app, "error", "sidecar", &message, None);
        return Err(message);
    };

    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    *guard = Some(SidecarProcess { child, port });

    append_tauri_log(
        &app,
        "info",
        "sidecar",
        "Started bundled sidecar process",
        Some(format!("pid={pid} port={port}")),
    );

    Ok(SidecarInfo { port, pid })
}

fn allocate_sidecar_port(app: &tauri::AppHandle) -> Result<u16, String> {
    // Bind once in Rust so the Node sidecar receives a concrete port instead
    // of reporting PORT=0, which the frontend cannot use for health checks.
    let listener = TcpListener::bind((SIDECAR_HOST, AUTO_ASSIGN_PORT)).map_err(|e| {
        let message = format!("Failed to allocate sidecar port: {e}");
        append_tauri_log(app, "error", "sidecar", &message, None);
        message
    })?;
    let port = listener
        .local_addr()
        .map_err(|e| {
            let message = format!("Failed to read allocated sidecar port: {e}");
            append_tauri_log(app, "error", "sidecar", &message, None);
            message
        })?
        .port();
    drop(listener);
    Ok(port)
}

fn drain_child_stdout(mut reader: BufReader<ChildStdout>) {
    thread::spawn(move || {
        let mut line = String::new();
        while reader.read_line(&mut line).unwrap_or(0) > 0 {
            line.clear();
        }
    });
}

fn drain_child_stderr(mut stderr: ChildStderr) {
    thread::spawn(move || {
        let mut buffer = [0_u8; 8192];
        while stderr.read(&mut buffer).unwrap_or(0) > 0 {}
    });
}

fn read_child_stderr(stderr: Option<std::process::ChildStderr>) -> String {
    let Some(mut stderr) = stderr else {
        return "stderr unavailable".to_string();
    };
    let mut buffer = String::new();
    match stderr.read_to_string(&mut buffer) {
        Ok(_) if !buffer.trim().is_empty() => buffer.trim().chars().take(1200).collect(),
        _ => "no stderr from sidecar".to_string(),
    }
}

#[tauri::command]
fn stop_sidecar(state: tauri::State<'_, SidecarState>) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(mut process) = guard.take() {
        process
            .child
            .kill()
            .map_err(|e| format!("Failed to stop sidecar: {}", e))?;
        process.child.wait().ok();
    }
    Ok(())
}

// Keychain operations using keyring crate
#[tauri::command]
async fn store_credential(
    service: String,
    account: String,
    password: String,
) -> Result<(), String> {
    let entry = Entry::new(&service, &account).map_err(|e| e.to_string())?;
    entry.set_password(&password).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn get_credential(service: String, account: String) -> Result<String, String> {
    let entry = Entry::new(&service, &account).map_err(|e| e.to_string())?;
    let password = entry.get_password().map_err(|e| e.to_string())?;
    Ok(password)
}

#[tauri::command]
async fn delete_credential(service: String, account: String) -> Result<(), String> {
    let entry = Entry::new(&service, &account).map_err(|e| e.to_string())?;
    entry.delete_credential().map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .manage(SidecarState(Mutex::new(None)))
        .manage(TerminalSessionState::default())
        .manage(PostgresJobState::default())
        .setup(|app| {
            // Auto-start sidecar on app launch
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let state = app_handle.state::<SidecarState>();
                match start_sidecar(app_handle.clone(), state).await {
                    Ok(info) => {
                        append_tauri_log(
                            &app_handle,
                            "info",
                            "sidecar",
                            "Auto-started sidecar on app launch",
                            Some(format!("pid={} port={}", info.pid, info.port)),
                        );
                    }
                    Err(e) => {
                        append_tauri_log(
                            &app_handle,
                            "error",
                            "sidecar",
                            "Failed to auto-start sidecar on launch",
                            Some(e),
                        );
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_app_data_dir,
            start_sidecar,
            stop_sidecar,
            store_credential,
            get_credential,
            delete_credential,
            start_postgres_psql_session,
            write_terminal_session,
            resize_terminal_session,
            stop_terminal_session,
            start_postgres_backup,
            start_postgres_restore,
            cancel_postgres_job,
            append_frontend_log,
            read_app_logs,
            clear_app_logs,
        ])
        .on_window_event(|window, event| {
            // Kill sidecar when the main window is closed
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(state) = window.app_handle().try_state::<SidecarState>() {
                    if let Ok(mut guard) = state.0.lock() {
                        if let Some(mut process) = guard.take() {
                            process.child.kill().ok();
                            process.child.wait().ok();
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
