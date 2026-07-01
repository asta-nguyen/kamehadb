use std::fs;
use std::path::{Path, PathBuf};

use tauri::AppHandle;
use thiserror::Error;
use uuid::Uuid;

use crate::connection_profile::{load_connection_profile, ConnectionKind};

use super::{StartBackupRequest, StartRestoreRequest};

#[derive(Clone, Debug)]
pub struct OracleProfile {
    pub host: String,
    pub port: u16,
    pub service: String,
    pub username: String,
    pub password: String,
}

#[derive(Clone, Debug)]
pub struct CommandSpec {
    pub program: String,
    pub args: Vec<String>,
    pub started_message: String,
    pub cleanup_path: PathBuf,
}

#[derive(Debug, Error)]
pub enum OracleToolError {
    #[error("The saved Oracle connection is missing a host")]
    MissingHost,
    #[error("The saved Oracle connection is missing a service name")]
    MissingService,
    #[error("The saved Oracle connection is missing a username")]
    MissingUsername,
    #[error("The saved Oracle connection is missing a password")]
    MissingPassword,
    #[error("{0}")]
    InvalidInput(String),
    #[error("Failed to write the Oracle Data Pump parameter file: {0}")]
    ParameterFile(String),
    #[error("{0}")]
    Spawn(String),
    #[error("{0}")]
    Profile(String),
}

pub fn load_oracle_profile(
    app: &AppHandle,
    connection_id: &str,
) -> Result<OracleProfile, OracleToolError> {
    let profile = load_connection_profile(app, connection_id, ConnectionKind::Oracle)
        .map_err(|error| OracleToolError::Profile(error.to_string()))?;

    Ok(OracleProfile {
        host: profile.host.ok_or(OracleToolError::MissingHost)?,
        port: profile.port.unwrap_or(1521),
        service: profile.database.ok_or(OracleToolError::MissingService)?,
        username: profile.username.ok_or(OracleToolError::MissingUsername)?,
        password: profile.password.ok_or(OracleToolError::MissingPassword)?,
    })
}

pub fn build_backup_command(
    profile: &OracleProfile,
    request: &StartBackupRequest,
) -> Result<CommandSpec, OracleToolError> {
    let directory_object = validate_non_empty(&request.directory_object, "Directory object is required")?;
    let dump_file = validate_non_empty(&request.dump_file, "Dump file is required")?;
    let schema = validate_non_empty(&request.schema, "Schema is required")?;
    let log_file = log_file_name(&dump_file, "export");
    let parfile = write_parameter_file(&[
        format!("userid={}", connect_descriptor(profile)),
        format!("directory={directory_object}"),
        format!("dumpfile={dump_file}"),
        format!("logfile={log_file}"),
        format!("schemas={schema}"),
    ])?;

    Ok(CommandSpec {
        program: resolve_oracle_program("expdp"),
        args: vec![format!("parfile={}", parfile.display())],
        started_message: format!("Backing up Oracle schema {schema}"),
        cleanup_path: parfile,
    })
}

pub fn build_restore_command(
    profile: &OracleProfile,
    request: &StartRestoreRequest,
) -> Result<CommandSpec, OracleToolError> {
    let directory_object = validate_non_empty(&request.directory_object, "Directory object is required")?;
    let dump_file = validate_non_empty(&request.dump_file, "Dump file is required")?;
    let source_schema = validate_non_empty(&request.source_schema, "Source schema is required")?;
    let target_schema = validate_non_empty(&request.target_schema, "Target schema is required")?;
    let log_file = log_file_name(&dump_file, "import");

    let mut lines = vec![
        format!("userid={}", connect_descriptor(profile)),
        format!("directory={directory_object}"),
        format!("dumpfile={dump_file}"),
        format!("logfile={log_file}"),
        format!("schemas={source_schema}"),
    ];
    if request.replace_existing {
        lines.push("table_exists_action=replace".into());
    }
    if source_schema != target_schema {
        lines.push(format!("remap_schema={source_schema}:{target_schema}"));
    }

    let parfile = write_parameter_file(&lines)?;

    Ok(CommandSpec {
        program: resolve_oracle_program("impdp"),
        args: vec![format!("parfile={}", parfile.display())],
        started_message: format!("Restoring Oracle schema {source_schema} into {target_schema}"),
        cleanup_path: parfile,
    })
}

pub fn resolve_oracle_program(program: &str) -> String {
    let direct = PathBuf::from(program);
    if direct.is_absolute() || program.contains(std::path::MAIN_SEPARATOR) {
        return program.into();
    }

    if let Some(path) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&path) {
            let candidate = dir.join(program);
            if candidate.is_file() {
                return candidate.to_string_lossy().into_owned();
            }
        }
    }

    if let Some(oracle_home) = std::env::var_os("ORACLE_HOME") {
        let candidate = PathBuf::from(oracle_home).join("bin").join(program);
        if candidate.is_file() {
            return candidate.to_string_lossy().into_owned();
        }
    }

    for dir in [
        "/usr/local/bin",
        "/opt/homebrew/bin",
        "/opt/oracle/bin",
        "/usr/lib/oracle/23/client64/bin",
        "/usr/lib/oracle/21/client64/bin",
    ] {
        let candidate = PathBuf::from(dir).join(program);
        if candidate.is_file() {
            return candidate.to_string_lossy().into_owned();
        }
    }

    program.into()
}

fn connect_descriptor(profile: &OracleProfile) -> String {
    format!(
        "{}/{}@//{}:{}/{}",
        profile.username, profile.password, profile.host, profile.port, profile.service
    )
}

fn validate_non_empty(value: &str, message: &str) -> Result<String, OracleToolError> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(OracleToolError::InvalidInput(message.into()));
    }
    Ok(trimmed.into())
}

fn log_file_name(dump_file: &str, suffix: &str) -> String {
    let path = Path::new(dump_file);
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .unwrap_or("oracle");
    format!("{stem}-{suffix}.log")
}

fn write_parameter_file(lines: &[String]) -> Result<PathBuf, OracleToolError> {
    let path = std::env::temp_dir().join(format!("kamehadb-oracle-{}.par", Uuid::new_v4()));
    let contents = lines.join("\n");
    fs::write(&path, contents).map_err(|error| OracleToolError::ParameterFile(error.to_string()))?;
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::oracle_tools::{StartBackupRequest, StartRestoreRequest};

    fn command_name(program: &str) -> &str {
        Path::new(program)
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or(program)
    }

    fn profile() -> OracleProfile {
        OracleProfile {
            host: "localhost".into(),
            port: 1521,
            service: "FREEPDB1".into(),
            username: "kameha".into(),
            password: "secret".into(),
        }
    }

    #[test]
    fn backup_command_uses_parfile() {
        let command = build_backup_command(
            &profile(),
            &StartBackupRequest {
                connection_id: "oracle".into(),
                directory_object: "DATA_PUMP_DIR".into(),
                dump_file: "kameha.dmp".into(),
                schema: "KAMEHA".into(),
            },
        )
        .expect("backup command should build");

        let parfile = fs::read_to_string(&command.cleanup_path).expect("parfile should exist");
        assert_eq!(command_name(&command.program), "expdp");
        assert_eq!(command.args.len(), 1);
        assert!(command.args[0].starts_with("parfile="));
        assert!(parfile.contains("directory=DATA_PUMP_DIR"));
        assert!(parfile.contains("dumpfile=kameha.dmp"));
        assert!(parfile.contains("schemas=KAMEHA"));
        assert!(parfile.contains("userid=kameha/secret@//localhost:1521/FREEPDB1"));
        let _ = fs::remove_file(&command.cleanup_path);
    }

    #[test]
    fn restore_command_adds_remap_schema() {
        let command = build_restore_command(
            &profile(),
            &StartRestoreRequest {
                connection_id: "oracle".into(),
                directory_object: "DATA_PUMP_DIR".into(),
                dump_file: "kameha.dmp".into(),
                source_schema: "KAMEHA".into(),
                target_schema: "KAMEHA_RESTORE".into(),
                replace_existing: true,
            },
        )
        .expect("restore command should build");

        let parfile = fs::read_to_string(&command.cleanup_path).expect("parfile should exist");
        assert_eq!(command_name(&command.program), "impdp");
        assert!(parfile.contains("schemas=KAMEHA"));
        assert!(parfile.contains("remap_schema=KAMEHA:KAMEHA_RESTORE"));
        assert!(parfile.contains("table_exists_action=replace"));
        let _ = fs::remove_file(&command.cleanup_path);
    }
}
