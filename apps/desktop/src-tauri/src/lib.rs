use serde::Serialize;
use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::Manager;

mod app_logs;
mod postgres_psql;
mod postgres_tools;
mod profiles;
mod sqlcmd;
mod sqlite3;
mod terminal_sessions;
mod tool_paths;

use app_logs::{append_frontend_log, append_tauri_log, clear_app_logs, read_app_logs};
use postgres_psql::start_postgres_psql_session;
use sqlcmd::start_sqlcmd_session;
use sqlite3::start_sqlite3_session;
use terminal_sessions::{
    resize_terminal_session, stop_terminal_session, write_terminal_session, TerminalSessionState,
};
use postgres_tools::{
    cancel_postgres_job, start_postgres_backup, start_postgres_restore, PostgresJobState,
};

struct SidecarState(Mutex<Option<Child>>);

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

#[tauri::command]
async fn start_sidecar(
    app: tauri::AppHandle,
    state: tauri::State<'_, SidecarState>,
) -> Result<SidecarInfo, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;

    let sidecar_path = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .join("sidecar")
        .join("index.js");

    let child = Command::new("node")
        .arg(&sidecar_path)
        .env("KAMEHADB_DATA_DIR", data_dir.to_string_lossy().to_string())
        .env("PORT", "0")
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| {
            let message = format!("Failed to start sidecar: {}", e);
            append_tauri_log(&app, "error", "sidecar", &message, None);
            message
        })?;

    let pid = child.id();
    let port = 3170; // Placeholder - will be read from sidecar output

    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    *guard = Some(child);

    append_tauri_log(
        &app,
        "info",
        "sidecar",
        "Started bundled sidecar process",
        Some(format!("pid={pid} port={port}")),
    );

    Ok(SidecarInfo { port, pid })
}

#[tauri::command]
fn stop_sidecar(state: tauri::State<'_, SidecarState>) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(mut child) = guard.take() {
        child
            .kill()
            .map_err(|e| format!("Failed to stop sidecar: {}", e))?;
        child.wait().ok();
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(SidecarState(Mutex::new(None)))
        .manage(TerminalSessionState::default())
        .manage(PostgresJobState::default())
        .invoke_handler(tauri::generate_handler![
            get_app_data_dir,
            start_sidecar,
            stop_sidecar,
            start_postgres_psql_session,
            start_sqlite3_session,
            start_sqlcmd_session,
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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
