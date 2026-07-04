use std::collections::HashMap;
use std::io::ErrorKind;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex as AsyncMutex;
use tokio::time::sleep;
use uuid::Uuid;

use super::config::{
    build_backup_command, build_restore_command, resolve_mysql_program, CommandSpec,
    MysqlProfile, MysqlToolError,
};
use super::{
    MysqlToolEvent, MysqlToolKind, OutputStream, StartBackupRequest, StartRestoreRequest,
    MYSQL_TOOL_EVENT,
};

pub struct JobControl {
    child: Arc<AsyncMutex<Child>>,
    cancelled: Arc<AtomicBool>,
}

#[derive(Default)]
pub struct MysqlJobState(pub Arc<Mutex<HashMap<String, JobControl>>>);

pub async fn start_backup_job(
    app: AppHandle,
    state: &MysqlJobState,
    profile: MysqlProfile,
    request: StartBackupRequest,
) -> Result<String, MysqlToolError> {
    let program = resolve_mysql_program(&app, "mysqldump", &profile);
    let spec = build_backup_command(&program, &profile, &request);
    start_job(app, state, MysqlToolKind::Backup, spec).await
}

pub async fn start_restore_job(
    app: AppHandle,
    state: &MysqlJobState,
    profile: MysqlProfile,
    request: StartRestoreRequest,
) -> Result<String, MysqlToolError> {
    let program = resolve_mysql_program(&app, "mysql", &profile);
    let spec = build_restore_command(&program, &profile, &request)?;
    start_job(app, state, MysqlToolKind::Restore, spec).await
}

pub async fn cancel_job(state: &MysqlJobState, job_id: &str) -> Result<(), MysqlToolError> {
    let (child, cancelled) = {
        let guard = state
            .0
            .lock()
            .map_err(|error| MysqlToolError::Spawn(error.to_string()))?;
        let control = guard.get(job_id).ok_or_else(|| {
            MysqlToolError::InvalidRestoreInput("Backup or restore job was not found".into())
        })?;
        (Arc::clone(&control.child), Arc::clone(&control.cancelled))
    };

    child
        .lock()
        .await
        .kill()
        .await
        .map_err(|error| MysqlToolError::Spawn(error.to_string()))?;
    cancelled.store(true, Ordering::SeqCst);
    Ok(())
}

async fn start_job(
    app: AppHandle,
    state: &MysqlJobState,
    kind: MysqlToolKind,
    spec: CommandSpec,
) -> Result<String, MysqlToolError> {
    let job_id = Uuid::new_v4().to_string();
    let program = spec.program.clone();
    let mut command = Command::new(&program);
    command.args(&spec.args);
    command.envs(spec.env.iter().map(|(key, value)| (key, value)));
    command.stdout(Stdio::piped());
    command.stderr(Stdio::piped());
    // Restore pipes the dump file into stdin; backup has nothing to feed.
    if spec.stdin_file.is_some() {
        command.stdin(Stdio::piped());
    } else {
        command.stdin(Stdio::null());
    }

    let mut child = command
        .spawn()
        .map_err(|error| MysqlToolError::Spawn(spawn_message(&program, &error)))?;
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let stdin = child.stdin.take();
    let stdin_file = spec.stdin_file.clone();
    let child = Arc::new(AsyncMutex::new(child));
    let cancelled = Arc::new(AtomicBool::new(false));

    {
        let mut guard = state
            .0
            .lock()
            .map_err(|error| MysqlToolError::Spawn(error.to_string()))?;
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
    let tool_name = program;
    let task_job_id = job_id.clone();
    tauri::async_runtime::spawn(async move {
        emit(
            &app,
            MysqlToolEvent::Started {
                job_id: task_job_id.clone(),
                kind,
                message: started_message,
            },
        );

        // Restore: stream the dump file into the client's stdin and close it
        // so the server receives EOF and finishes the import.
        if let (Some(mut stdin), Some(path)) = (stdin, stdin_file) {
            match tokio::fs::File::open(&path).await {
                Ok(mut file) => {
                    let _ = tokio::io::copy(&mut file, &mut stdin).await;
                    let _ = stdin.shutdown().await;
                }
                Err(error) => {
                    emit(
                        &app,
                        MysqlToolEvent::Failed {
                            job_id: task_job_id.clone(),
                            kind,
                            exit_code: None,
                            message: format!("Failed to read dump file: {error}"),
                        },
                    );
                }
            }
        }

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
                MysqlToolEvent::Cancelled {
                    job_id: task_job_id,
                    kind,
                    message: format!("{} cancelled", tool_name),
                },
            ),
            Ok(status) if status.success() => emit(
                &app,
                MysqlToolEvent::Finished {
                    job_id: task_job_id,
                    kind,
                    exit_code: status.code().unwrap_or(0),
                    message: format!("{} completed successfully", tool_name),
                },
            ),
            Ok(status) => emit(
                &app,
                MysqlToolEvent::Failed {
                    job_id: task_job_id,
                    kind,
                    exit_code: status.code(),
                    message: failure_message(&tool_name, last_error, status.code()),
                },
            ),
            Err(error) => emit(
                &app,
                MysqlToolEvent::Failed {
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
    kind: MysqlToolKind,
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
            MysqlToolEvent::Log {
                job_id: job_id.clone(),
                kind,
                stream,
                line,
            },
        );
    }
}

fn emit(app: &AppHandle, event: MysqlToolEvent) {
    let _ = app.emit(MYSQL_TOOL_EVENT, event);
}

fn spawn_message(program: &str, error: &std::io::Error) -> String {
    if error.kind() == ErrorKind::NotFound {
        return format!(
            "{program} was not found in PATH. Install the MySQL/MariaDB client tools and try again."
        );
    }
    error.to_string()
}

fn failure_message(tool_name: &str, last_error: Option<String>, exit_code: Option<i32>) -> String {
    if let Some(last_error) = last_error {
        let lowered = last_error.to_ascii_lowercase();
        if lowered.contains("access denied") || lowered.contains("password") {
            return "Authentication failed. Check the saved MySQL/MariaDB username/password.".into();
        }
        if lowered.contains("unknown database") {
            return "The target database was not found on the server.".into();
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
