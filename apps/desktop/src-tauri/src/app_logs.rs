use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::cmp::Reverse;
use std::collections::VecDeque;
use std::fs::{self, File, OpenOptions};
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const LOG_DIR_NAME: &str = "logs";
const FRONTEND_LOG_FILE: &str = "frontend.log";
const TAURI_LOG_FILE: &str = "tauri.log";
const SIDECAR_LOG_FILE: &str = "sidecar.log";
const MAX_TAIL_BYTES: u64 = 256 * 1024;

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

    entries.extend(read_native_log(
        &log_dir.join(FRONTEND_LOG_FILE),
        max_entries,
    ));
    entries.extend(read_native_log(&log_dir.join(TAURI_LOG_FILE), max_entries));
    entries.extend(read_sidecar_log(
        &log_dir.join(SIDECAR_LOG_FILE),
        max_entries,
    ));

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

fn append_log_entry(
    app: &AppHandle,
    file_name: &str,
    entry: &AppLogEntry,
) -> Result<(), std::io::Error> {
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

// Read only the tail window we can actually render so the 2s refresh cadence
// does not rescan the entire log history on every poll.
fn read_native_log(path: &Path, limit: usize) -> Vec<AppLogEntry> {
    let Ok(lines) = read_last_lines(path, limit) else {
        return Vec::new();
    };

    lines
        .into_iter()
        .filter_map(|line| serde_json::from_str::<AppLogEntry>(&line).ok())
        .collect()
}

// Sidecar logs are JSON-lines too, but they use pino's shape, so we tail them
// with the same bounded reader and then normalize each record for the UI.
fn read_sidecar_log(path: &Path, limit: usize) -> Vec<AppLogEntry> {
    let Ok(lines) = read_last_lines(path, limit) else {
        return Vec::new();
    };

    lines
        .into_iter()
        .filter_map(|line| parse_sidecar_log_line(&line))
        .collect()
}

fn read_last_lines(path: &Path, limit: usize) -> Result<Vec<String>, std::io::Error> {
    if limit == 0 {
        return Ok(Vec::new());
    }

    let mut file = File::open(path)?;
    let start = find_tail_start(&mut file, limit)?;

    // If the tail scan fell back to min_start, the position may be mid-record.
    // Advance to the next newline so decoding starts on a safe boundary.
    let start = if start == 0 {
        0
    } else {
        file.seek(SeekFrom::Start(start))?;
        let mut reader = BufReader::new(&file);
        let mut buf = [0u8; 1];
        let mut pos = start;
        loop {
            match reader.read(&mut buf)? {
                0 => break,
                _ => {
                    if buf[0] == b'\n' {
                        break;
                    }
                    pos += 1;
                }
            }
        }
        pos
    };

    file.seek(SeekFrom::Start(start))?;

    // Keep only the newest `limit` lines in memory because the tail window can
    // still contain oversized records or fewer newlines than expected.
    let mut lines = VecDeque::with_capacity(limit);
    for line in BufReader::new(file).lines() {
        let line = line?;
        if lines.len() == limit {
            lines.pop_front();
        }
        lines.push_back(line);
    }

    Ok(lines.into_iter().collect())
}

fn find_tail_start(file: &mut File, limit: usize) -> Result<u64, std::io::Error> {
    const CHUNK_SIZE: usize = 8 * 1024;

    let file_len = file.metadata()?.len();
    if file_len == 0 {
        return Ok(0);
    }

    // Bound the scan to the last 256 KB so a malformed or sparse log file does
    // not force every 2-second refresh to walk the entire history.
    let min_start = file_len.saturating_sub(MAX_TAIL_BYTES);
    let mut position = file_len;
    let mut seen_lines = 0usize;

    while position > min_start {
        let remaining = position - min_start;
        let chunk_size = usize::min(CHUNK_SIZE, remaining as usize);
        position -= chunk_size as u64;
        file.seek(SeekFrom::Start(position))?;

        let mut chunk = vec![0; chunk_size];
        file.read_exact(&mut chunk)?;

        for (index, byte) in chunk.iter().enumerate().rev() {
            if *byte != b'\n' {
                continue;
            }

            let newline_offset = position + index as u64;
            if newline_offset + 1 == file_len {
                continue;
            }

            seen_lines += 1;
            if seen_lines >= limit {
                return Ok(newline_offset + 1);
            }
        }
    }

    Ok(min_start)
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
        scope: value
            .get("scope")
            .and_then(Value::as_str)
            .map(str::to_string),
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
