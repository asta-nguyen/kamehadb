use std::collections::HashMap;
use std::io::ErrorKind;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex as AsyncMutex;
use tokio::time::sleep;
use uuid::Uuid;

use super::config::{
    build_backup_command, build_restore_command, CommandSpec, PostgresProfile, PostgresToolError,
};
use super::{
    OutputStream, PostgresToolEvent, PostgresToolKind, StartBackupRequest, StartRestoreRequest,
    POSTGRES_TOOL_EVENT,
};

pub struct JobControl {
    child: Arc<AsyncMutex<Child>>,
    cancelled: Arc<AtomicBool>,
}

#[derive(Default)]
pub struct PostgresJobState(pub Arc<Mutex<HashMap<String, JobControl>>>);

pub async fn start_backup_job(
    app: AppHandle,
    state: &PostgresJobState,
    profile: PostgresProfile,
    request: StartBackupRequest,
) -> Result<String, PostgresToolError> {
    let spec = build_backup_command(&profile, &request);
    start_job(app, state, PostgresToolKind::Backup, spec).await
}

pub async fn start_restore_job(
    app: AppHandle,
    state: &PostgresJobState,
    profile: PostgresProfile,
    request: StartRestoreRequest,
) -> Result<String, PostgresToolError> {
    let spec = build_restore_command(&profile, &request)?;
    start_job(app, state, PostgresToolKind::Restore, spec).await
}

pub async fn cancel_job(state: &PostgresJobState, job_id: &str) -> Result<(), PostgresToolError> {
    let (child, cancelled) = {
        let guard = state
            .0
            .lock()
            .map_err(|error| PostgresToolError::Spawn(error.to_string()))?;
        let control = guard.get(job_id).ok_or_else(|| {
            PostgresToolError::InvalidRestoreInput("Backup or restore job was not found".into())
        })?;
        (Arc::clone(&control.child), Arc::clone(&control.cancelled))
    };

    child
        .lock()
        .await
        .kill()
        .await
        .map_err(|error| PostgresToolError::Spawn(error.to_string()))?;
    cancelled.store(true, Ordering::SeqCst);
    Ok(())
}

async fn start_job(
    app: AppHandle,
    state: &PostgresJobState,
    kind: PostgresToolKind,
    spec: CommandSpec,
) -> Result<String, PostgresToolError> {
    let job_id = Uuid::new_v4().to_string();
    let mut command = Command::new(spec.program);
    command.args(&spec.args);
    command.envs(spec.env.iter().map(|(key, value)| (key, value)));
    command.stdout(Stdio::piped());
    command.stderr(Stdio::piped());

    let mut child = command
        .spawn()
        .map_err(|error| PostgresToolError::Spawn(spawn_message(spec.program, &error)))?;
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let child = Arc::new(AsyncMutex::new(child));
    let cancelled = Arc::new(AtomicBool::new(false));

    {
        let mut guard = state
            .0
            .lock()
            .map_err(|error| PostgresToolError::Spawn(error.to_string()))?;
        guard.insert(
            job_id.clone(),
            JobControl {
                child: Arc::clone(&child),
                cancelled: Arc::clone(&cancelled),
            },
        );
    }

    let state_ref = Arc::clone(&state.0);
    let started_message = spec.started_message.clone();
    let tool_name = spec.program.to_string();
    let task_job_id = job_id.clone();
    tauri::async_runtime::spawn(async move {
        emit(
            &app,
            PostgresToolEvent::Started {
                job_id: task_job_id.clone(),
                kind,
                message: started_message,
            },
        );

        let last_stderr = Arc::new(AsyncMutex::new(None::<String>));
        let stdout_task = stdout.map(|pipe| {
            let app = app.clone();
            let job_id = task_job_id.clone();
            tokio::spawn(stream_pipe(
                app,
                job_id,
                kind,
                OutputStream::Stdout,
                pipe,
                None,
            ))
        });
        let stderr_task = stderr.map(|pipe| {
            let app = app.clone();
            let job_id = task_job_id.clone();
            let last_line = Arc::clone(&last_stderr);
            tokio::spawn(stream_pipe(
                app,
                job_id,
                kind,
                OutputStream::Stderr,
                pipe,
                Some(last_line),
            ))
        });

        let status_result = loop {
            let mut child_ref = child.lock().await;
            match child_ref.try_wait() {
                Ok(Some(status)) => break Ok(status),
                Ok(None) => {
                    // Release the lock so cancel can grab it and kill the child.
                    drop(child_ref);
                    sleep(Duration::from_millis(100)).await;
                }
                Err(error) => break Err(error),
            }
        };
        if let Some(task) = stdout_task {
            let _ = task.await;
        }
        if let Some(task) = stderr_task {
            let _ = task.await;
        }

        if let Ok(mut guard) = state_ref.lock() {
            guard.remove(&task_job_id);
        }

        let last_error = last_stderr.lock().await.clone();
        match status_result {
            Ok(_status) if cancelled.load(Ordering::SeqCst) => emit(
                &app,
                PostgresToolEvent::Cancelled {
                    job_id: task_job_id,
                    kind,
                    message: format!("{} cancelled", tool_name),
                },
            ),
            Ok(status) if status.success() => emit(
                &app,
                PostgresToolEvent::Finished {
                    job_id: task_job_id,
                    kind,
                    exit_code: status.code().unwrap_or(0),
                    message: format!("{} completed successfully", tool_name),
                },
            ),
            Ok(status) => emit(
                &app,
                PostgresToolEvent::Failed {
                    job_id: task_job_id,
                    kind,
                    exit_code: status.code(),
                    message: failure_message(&tool_name, last_error, status.code()),
                },
            ),
            Err(error) => emit(
                &app,
                PostgresToolEvent::Failed {
                    job_id: task_job_id,
                    kind,
                    exit_code: None,
                    message: error.to_string(),
                },
            ),
        }
    });

    Ok(job_id)
}

async fn stream_pipe<R>(
    app: AppHandle,
    job_id: String,
    kind: PostgresToolKind,
    stream: OutputStream,
    pipe: R,
    last_line: Option<Arc<AsyncMutex<Option<String>>>>,
) where
    R: tokio::io::AsyncRead + Unpin,
{
    let mut lines = BufReader::new(pipe).lines();
    while let Ok(Some(line)) = lines.next_line().await {
        if let Some(last_line) = &last_line {
            *last_line.lock().await = Some(line.clone());
        }
        emit(
            &app,
            PostgresToolEvent::Log {
                job_id: job_id.clone(),
                kind,
                stream,
                line,
            },
        );
    }
}

fn emit(app: &AppHandle, event: PostgresToolEvent) {
    let _ = app.emit(POSTGRES_TOOL_EVENT, event);
}

fn spawn_message(program: &str, error: &std::io::Error) -> String {
    if error.kind() == ErrorKind::NotFound {
        return format!(
            "{program} was not found in PATH. Install the PostgreSQL client tools and try again."
        );
    }
    error.to_string()
}

fn failure_message(tool_name: &str, last_error: Option<String>, exit_code: Option<i32>) -> String {
    if let Some(last_error) = last_error {
        let lowered = last_error.to_ascii_lowercase();
        if lowered.contains("password authentication failed") || lowered.contains("fe_sendauth") {
            return "Authentication failed. Check the saved PostgreSQL username/password.".into();
        }
        if lowered.contains("not a valid archive")
            || lowered.contains("input file appears to be a text format dump")
        {
            return "The selected dump format does not match the restore tool. Use a plain .sql file with psql or a .dump/.tar archive with pg_restore.".into();
        }
        return last_error;
    }

    match exit_code {
        Some(code) => {
            format!("{tool_name} exited with code {code}. Review the command output above.")
        }
        None => format!("{tool_name} failed before an exit code was reported."),
    }
}
