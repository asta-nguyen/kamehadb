use anyhow::{anyhow, Context, Result};
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::collections::HashMap;
use std::io::ErrorKind;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use super::{
    PtyCommandSpec, TerminalSessionEvent, TerminalSessionKind, TerminalSize, TERMINAL_SESSION_EVENT,
};

struct TerminalSessionControl {
    killer: Arc<Mutex<Box<dyn portable_pty::ChildKiller + Send + Sync>>>,
    master: Arc<Mutex<Box<dyn portable_pty::MasterPty + Send>>>,
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
}

#[derive(Default)]
pub struct TerminalSessionState(Arc<Mutex<HashMap<String, TerminalSessionControl>>>);

pub fn spawn_session(
    app: AppHandle,
    state: &TerminalSessionState,
    kind: TerminalSessionKind,
    size: TerminalSize,
    spec: PtyCommandSpec,
) -> Result<String> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: size.rows.max(1),
            cols: size.cols.max(1),
            pixel_width: 0,
            pixel_height: 0,
        })
        .context("Failed to allocate a pseudo terminal")?;
    let mut command = CommandBuilder::new(&spec.program);
    command.args(&spec.args);
    command.env("COLORTERM", "truecolor");
    command.env("TERM", "xterm-256color");
    for (key, value) in &spec.env {
        command.env(key, value);
    }

    let child = pair
        .slave
        .spawn_command(command)
        .map_err(|error| {
            anyhow!(spawn_error_message(
                &spec.program,
                &spec.missing_program_hint,
                error,
            ))
        })?;
    let killer = Arc::new(Mutex::new(child.clone_killer()));
    let reader = pair
        .master
        .try_clone_reader()
        .context("Failed to attach a PTY reader")?;
    let writer = Arc::new(Mutex::new(
        pair.master
            .take_writer()
            .context("Failed to attach a PTY writer")?,
    ));
    let master = Arc::new(Mutex::new(pair.master));
    let session_id = Uuid::new_v4().to_string();

    {
        let mut guard = state
            .0
            .lock()
            .map_err(|_| anyhow!("Failed to store the terminal session state"))?;
        guard.insert(
            session_id.clone(),
            TerminalSessionControl {
                killer: Arc::clone(&killer),
                master: Arc::clone(&master),
                writer: Arc::clone(&writer),
            },
        );
    }

    emit(
        &app,
        TerminalSessionEvent::Started {
            session_id: session_id.clone(),
            kind,
            message: spec.started_message,
        },
    );
    spawn_reader(app.clone(), session_id.clone(), kind, reader);
    spawn_waiter(
        app,
        Arc::clone(&state.0),
        session_id.clone(),
        kind,
        spec.program,
        child,
    );

    Ok(session_id)
}

pub fn write_session(state: &TerminalSessionState, session_id: &str, data: &str) -> Result<()> {
    let writer = {
        let guard = state
            .0
            .lock()
            .map_err(|_| anyhow!("Failed to read the terminal session state"))?;
        let session = guard
            .get(session_id)
            .ok_or_else(|| anyhow!("The terminal session was not found"))?;
        Arc::clone(&session.writer)
    };

    let mut writer = writer
        .lock()
        .map_err(|_| anyhow!("Failed to lock the PTY writer"))?;
    writer
        .write_all(data.as_bytes())
        .context("Failed to write to the PTY")?;
    writer.flush().context("Failed to flush PTY input")
}

pub fn resize_session(
    state: &TerminalSessionState,
    session_id: &str,
    size: TerminalSize,
) -> Result<()> {
    let master = {
        let guard = state
            .0
            .lock()
            .map_err(|_| anyhow!("Failed to read the terminal session state"))?;
        let session = guard
            .get(session_id)
            .ok_or_else(|| anyhow!("The terminal session was not found"))?;
        Arc::clone(&session.master)
    };

    let resize_result = master
        .lock()
        .map_err(|_| anyhow!("Failed to lock the PTY"))?
        .resize(PtySize {
            rows: size.rows.max(1),
            cols: size.cols.max(1),
            pixel_width: 0,
            pixel_height: 0,
        });

    resize_result.context("Failed to resize the PTY")
}

pub fn stop_session(state: &TerminalSessionState, session_id: &str) -> Result<()> {
    let killer = {
        let mut guard = state
            .0
            .lock()
            .map_err(|_| anyhow!("Failed to read the terminal session state"))?;
        let session = guard
            .remove(session_id)
            .ok_or_else(|| anyhow!("The terminal session was not found"))?;
        session.killer
    };

    let kill_result = killer
        .lock()
        .map_err(|_| anyhow!("Failed to lock the PTY child"))?
        .kill();

    kill_result.context("Failed to stop the PTY process")
}

fn spawn_reader(
    app: AppHandle,
    session_id: String,
    kind: TerminalSessionKind,
    mut reader: Box<dyn Read + Send>,
) {
    std::thread::spawn(move || {
        let mut buffer = [0_u8; 8192];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(size) => emit(
                    &app,
                    TerminalSessionEvent::Data {
                        session_id: session_id.clone(),
                        kind,
                        data: buffer[..size].to_vec(),
                    },
                ),
                Err(error) if error.kind() == std::io::ErrorKind::Interrupted => continue,
                Err(_) => break,
            }
        }
    });
}

fn spawn_waiter(
    app: AppHandle,
    state: Arc<Mutex<HashMap<String, TerminalSessionControl>>>,
    session_id: String,
    kind: TerminalSessionKind,
    program: String,
    mut child: Box<dyn portable_pty::Child + Send + Sync>,
) {
    std::thread::spawn(move || {
        let status = child.wait();
        if let Ok(mut guard) = state.lock() {
            guard.remove(&session_id);
        }

        match status {
            Ok(status) => emit(
                &app,
                TerminalSessionEvent::Exit {
                    session_id,
                    kind,
                    exit_code: status.exit_code(),
                    message: exit_message(&program, status.exit_code()),
                },
            ),
            Err(error) => emit(
                &app,
                TerminalSessionEvent::Error {
                    session_id,
                    kind,
                    message: error.to_string(),
                },
            ),
        }
    });
}

fn emit(app: &AppHandle, event: TerminalSessionEvent) {
    let _ = app.emit(TERMINAL_SESSION_EVENT, event);
}

fn exit_message(program: &str, exit_code: u32) -> String {
    if exit_code == 0 {
        return format!("{program} session ended");
    }
    format!("{program} exited with code {exit_code}")
}

fn spawn_error_message(
    program: &str,
    missing_program_hint: &str,
    error: anyhow::Error,
) -> String {
    if error
        .chain()
        .any(|cause| matches!(cause.downcast_ref::<std::io::Error>(), Some(io_error) if io_error.kind() == ErrorKind::NotFound))
    {
        return format!("{program} was not found in PATH. {missing_program_hint}");
    }
    error.to_string()
}

#[cfg(test)]
mod tests {
    use super::spawn_error_message;
    use anyhow::anyhow;
    use std::io::{Error, ErrorKind};

    #[test]
    fn spawn_error_message_maps_not_found_errors() {
        let error = anyhow!(Error::from(ErrorKind::NotFound));

        assert_eq!(
            spawn_error_message(
                "psql",
                "Install the PostgreSQL client tools and try again.",
                error,
            ),
            "psql was not found in PATH. Install the PostgreSQL client tools and try again."
        );
    }
}
