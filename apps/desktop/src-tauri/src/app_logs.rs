use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::cmp::Reverse;
use std::fs::{self, File, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const LOG_DIR_NAME: &str = "logs";
const FRONTEND_LOG_FILE: &str = "frontend.log";
const TAURI_LOG_FILE: &str = "tauri.log";
const SIDECAR_LOG_FILE: &str = "sidecar.log";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FrontendLogInput {
    pub timestamp_ms: Option<u64>,
    pub level: String,
    pub message: String,
    pub scope: Option<String>,
    pub details: Option<String>,
    pub stack: Option<String>,
    pub url: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppLogEntry {
    pub timestamp_ms: u64,
    pub level: String,
    pub source: String,
    pub message: String,
    pub scope: Option<String>,
    pub details: Option<String>,
    pub stack: Option<String>,
    pub url: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppLogsSnapshot {
    pub entries: Vec<AppLogEntry>,
    pub log_dir: String,
}

#[tauri::command]
pub fn append_frontend_log(app: AppHandle, entry: FrontendLogInput) -> Result<(), String> {
    let record = AppLogEntry {
        timestamp_ms: entry.timestamp_ms.unwrap_or_else(now_ms),
        level: entry.level,
        source: "frontend".into(),
        message: entry.message,
        scope: entry.scope,
        details: entry.details,
        stack: entry.stack,
        url: entry.url,
    };
    append_log_entry(&app, FRONTEND_LOG_FILE, &record).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn read_app_logs(app: AppHandle, limit: Option<usize>) -> Result<AppLogsSnapshot, String> {
    let log_dir = ensure_log_dir(&app).map_err(|error| error.to_string())?;
    let max_entries = limit.unwrap_or(300).max(1);
    let mut entries = Vec::new();

    entries.extend(read_native_log(&log_dir.join(FRONTEND_LOG_FILE)));
    entries.extend(read_native_log(&log_dir.join(TAURI_LOG_FILE)));
    entries.extend(read_sidecar_log(&log_dir.join(SIDECAR_LOG_FILE)));

    entries.sort_by_key(|entry| Reverse(entry.timestamp_ms));
    if entries.len() > max_entries {
        entries.truncate(max_entries);
    }

    Ok(AppLogsSnapshot {
        entries,
        log_dir: log_dir.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
pub fn clear_app_logs(app: AppHandle) -> Result<(), String> {
    let log_dir = ensure_log_dir(&app).map_err(|error| error.to_string())?;
    for file_name in [FRONTEND_LOG_FILE, TAURI_LOG_FILE, SIDECAR_LOG_FILE] {
        let path = log_dir.join(file_name);
        if path.exists() {
            fs::write(&path, "").map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

pub fn append_tauri_log(
    app: &AppHandle,
    level: &str,
    scope: &str,
    message: &str,
    details: Option<String>,
) {
    let entry = AppLogEntry {
        timestamp_ms: now_ms(),
        level: level.into(),
        source: "tauri".into(),
        message: message.into(),
        scope: Some(scope.into()),
        details,
        stack: None,
        url: None,
    };

    let _ = append_log_entry(app, TAURI_LOG_FILE, &entry);
}

fn append_log_entry(app: &AppHandle, file_name: &str, entry: &AppLogEntry) -> Result<(), std::io::Error> {
    let log_dir = ensure_log_dir(app)?;
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_dir.join(file_name))?;
    let mut record = serde_json::to_vec(entry).map_err(std::io::Error::other)?;
    record.push(b'\n');
    file.write_all(&record)?;
    Ok(())
}

fn ensure_log_dir(app: &AppHandle) -> Result<PathBuf, std::io::Error> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(std::io::Error::other)?
        .join(LOG_DIR_NAME);
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn read_native_log(path: &Path) -> Vec<AppLogEntry> {
    let Ok(file) = File::open(path) else {
        return Vec::new();
    };

    BufReader::new(file)
        .lines()
        .map_while(Result::ok)
        .filter_map(|line| serde_json::from_str::<AppLogEntry>(&line).ok())
        .collect()
}

fn read_sidecar_log(path: &Path) -> Vec<AppLogEntry> {
    let Ok(file) = File::open(path) else {
        return Vec::new();
    };

    BufReader::new(file)
        .lines()
        .map_while(Result::ok)
        .filter_map(|line| parse_sidecar_log_line(&line))
        .collect()
}

fn parse_sidecar_log_line(line: &str) -> Option<AppLogEntry> {
    let value = serde_json::from_str::<Value>(line).ok()?;
    let timestamp_ms = value
        .get("time")
        .and_then(|raw| raw.as_u64().or_else(|| raw.as_str()?.parse().ok()))?;
    let message = value
        .get("msg")
        .and_then(Value::as_str)
        .unwrap_or("Sidecar log event")
        .to_string();
    let details = value
        .get("err")
        .map(Value::to_string)
        .or_else(|| collapse_sidecar_details(&value));

    Some(AppLogEntry {
        timestamp_ms,
        level: map_sidecar_level(value.get("level")),
        source: "sidecar".into(),
        message,
        scope: value.get("scope").and_then(Value::as_str).map(str::to_string),
        details,
        stack: None,
        url: None,
    })
}

fn collapse_sidecar_details(value: &Value) -> Option<String> {
    let mut object = value.as_object()?.clone();
    for key in ["level", "time", "pid", "hostname", "msg", "scope"] {
        object.remove(key);
    }
    if object.is_empty() {
        return None;
    }
    Some(Value::Object(object).to_string())
}

fn map_sidecar_level(level: Option<&Value>) -> String {
    match level.and_then(Value::as_u64).unwrap_or_default() {
        60 => "fatal".into(),
        50 => "error".into(),
        40 => "warn".into(),
        30 => "info".into(),
        20 => "debug".into(),
        10 => "trace".into(),
        _ => "info".into(),
    }
}
