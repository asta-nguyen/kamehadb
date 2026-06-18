use keyring::Entry;
use serde::Serialize;
use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::Manager;

mod postgres_psql;
mod postgres_tools;
mod terminal_sessions;

use postgres_psql::start_postgres_psql_session;
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
        .map_err(|e| format!("Failed to start sidecar: {}", e))?;

    let pid = child.id();
    let port = 3170; // Placeholder - will be read from sidecar output

    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    *guard = Some(child);

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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
