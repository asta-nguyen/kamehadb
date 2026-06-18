mod session;

use anyhow::Result;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

pub use session::TerminalSessionState;

use session::{resize_session, spawn_session, stop_session, write_session};

pub const TERMINAL_SESSION_EVENT: &str = "terminal-session-event";

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum TerminalSessionKind {
    PostgresPsql,
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSize {
    pub cols: u16,
    pub rows: u16,
}

#[derive(Clone, Debug, Serialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum TerminalSessionEvent {
    Started {
        session_id: String,
        kind: TerminalSessionKind,
        message: String,
    },
    Data {
        session_id: String,
        kind: TerminalSessionKind,
        data: Vec<u8>,
    },
    Exit {
        session_id: String,
        kind: TerminalSessionKind,
        exit_code: u32,
        message: String,
    },
    Error {
        session_id: String,
        kind: TerminalSessionKind,
        message: String,
    },
}

#[derive(Clone, Debug)]
pub struct PtyCommandSpec {
    pub args: Vec<String>,
    pub env: Vec<(String, String)>,
    pub program: String,
    pub started_message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSessionStarted {
    pub session_id: String,
}

#[tauri::command]
pub async fn write_terminal_session(
    state: tauri::State<'_, TerminalSessionState>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    write_session(state.inner(), &session_id, &data).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn resize_terminal_session(
    state: tauri::State<'_, TerminalSessionState>,
    session_id: String,
    size: TerminalSize,
) -> Result<(), String> {
    resize_session(state.inner(), &session_id, size).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn stop_terminal_session(
    state: tauri::State<'_, TerminalSessionState>,
    session_id: String,
) -> Result<(), String> {
    stop_session(state.inner(), &session_id).map_err(|error| error.to_string())
}

pub fn start_terminal_session(
    app: AppHandle,
    state: &TerminalSessionState,
    kind: TerminalSessionKind,
    size: TerminalSize,
    spec: PtyCommandSpec,
) -> Result<TerminalSessionStarted> {
    spawn_session(app, state, kind, size, spec)
        .map(|session_id| TerminalSessionStarted { session_id })
}

#[cfg(test)]
mod tests {
    use super::{TerminalSessionEvent, TerminalSessionKind};

    #[test]
    fn event_payload_uses_byte_arrays_for_stream_data() {
        let payload = serde_json::to_value(TerminalSessionEvent::Data {
            session_id: "session-1".into(),
            kind: TerminalSessionKind::PostgresPsql,
            data: vec![27, 91, 54, 110],
        })
        .expect("event should serialize");

        assert_eq!(
            payload.get("type").and_then(|value| value.as_str()),
            Some("data")
        );
        assert_eq!(
            payload.get("sessionId").and_then(|value| value.as_str()),
            Some("session-1")
        );
        assert_eq!(
            payload
                .get("data")
                .and_then(|value| value.as_array())
                .map(Vec::len),
            Some(4)
        );
    }
}
