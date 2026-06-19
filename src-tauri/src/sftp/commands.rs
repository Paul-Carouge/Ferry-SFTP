use super::connection::{Auth, RemoteEntry, SftpConnection};
use super::manager::SftpManager;
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AuthInput {
    Password,
    Key,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectInput {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_method: AuthInput,
    pub password: Option<String>,
    pub key_path: Option<String>,
    pub passphrase: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectResult {
    pub connection_id: String,
    pub home_dir: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ConnectionStatusPayload<'a> {
    connection_id: &'a str,
    state: &'a str,
    message: Option<String>,
}

fn emit_status(app: &AppHandle, connection_id: &str, state: &str, message: Option<String>) {
    let _ = app.emit(
        "connection:status",
        ConnectionStatusPayload {
            connection_id,
            state,
            message,
        },
    );
}

#[tauri::command]
pub async fn sftp_connect(
    app: AppHandle,
    manager: State<'_, SftpManager>,
    input: ConnectInput,
) -> AppResult<ConnectResult> {
    let connection_id = uuid::Uuid::new_v4().to_string();
    emit_status(&app, &connection_id, "connecting", None);

    let auth = match input.auth_method {
        AuthInput::Password => Auth::Password(input.password.ok_or_else(|| {
            AppError::InvalidInput("password required for password auth".into())
        })?),
        AuthInput::Key => Auth::Key {
            key_path: input
                .key_path
                .ok_or_else(|| AppError::InvalidInput("key_path required for key auth".into()))?,
            passphrase: input.passphrase,
        },
    };

    let host = input.host;
    let port = input.port;
    let username = input.username;

    let result = tauri::async_runtime::spawn_blocking(move || {
        SftpConnection::connect(&host, port, &username, auth)
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))?;

    match result {
        Ok(conn) => {
            let home_dir = conn.home_dir().to_string();
            manager.insert(connection_id.clone(), conn);
            emit_status(&app, &connection_id, "connected", None);
            Ok(ConnectResult {
                connection_id,
                home_dir,
            })
        }
        Err(e) => {
            emit_status(&app, &connection_id, "error", Some(e.to_string()));
            Err(e)
        }
    }
}

#[tauri::command]
pub fn sftp_disconnect(
    app: AppHandle,
    manager: State<'_, SftpManager>,
    connection_id: String,
) -> AppResult<()> {
    if let Some(conn) = manager.remove(&connection_id) {
        conn.disconnect();
    }
    emit_status(&app, &connection_id, "disconnected", None);
    Ok(())
}

#[tauri::command]
pub async fn sftp_list_dir(
    manager: State<'_, SftpManager>,
    connection_id: String,
    path: String,
) -> AppResult<Vec<RemoteEntry>> {
    let conn = manager.get(&connection_id)?;
    tauri::async_runtime::spawn_blocking(move || conn.list_dir(&path))
        .await
        .map_err(|e| AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn sftp_search(
    manager: State<'_, SftpManager>,
    connection_id: String,
    path: String,
    query: String,
) -> AppResult<Vec<RemoteEntry>> {
    let conn = manager.get(&connection_id)?;
    tauri::async_runtime::spawn_blocking(move || conn.search(&path, &query))
        .await
        .map_err(|e| AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn sftp_stat(
    manager: State<'_, SftpManager>,
    connection_id: String,
    path: String,
) -> AppResult<RemoteEntry> {
    let conn = manager.get(&connection_id)?;
    tauri::async_runtime::spawn_blocking(move || conn.stat(&path))
        .await
        .map_err(|e| AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn sftp_mkdir(
    manager: State<'_, SftpManager>,
    connection_id: String,
    path: String,
) -> AppResult<()> {
    let conn = manager.get(&connection_id)?;
    tauri::async_runtime::spawn_blocking(move || conn.mkdir(&path))
        .await
        .map_err(|e| AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn sftp_remove(
    manager: State<'_, SftpManager>,
    connection_id: String,
    path: String,
    is_dir: bool,
) -> AppResult<()> {
    let conn = manager.get(&connection_id)?;
    tauri::async_runtime::spawn_blocking(move || {
        if is_dir {
            conn.remove_dir(&path)
        } else {
            conn.remove_file(&path)
        }
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn sftp_rename(
    manager: State<'_, SftpManager>,
    connection_id: String,
    from: String,
    to: String,
) -> AppResult<()> {
    let conn = manager.get(&connection_id)?;
    tauri::async_runtime::spawn_blocking(move || conn.rename(&from, &to))
        .await
        .map_err(|e| AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn sftp_chmod(
    manager: State<'_, SftpManager>,
    connection_id: String,
    path: String,
    mode: u32,
) -> AppResult<()> {
    let conn = manager.get(&connection_id)?;
    tauri::async_runtime::spawn_blocking(move || conn.chmod(&path, mode))
        .await
        .map_err(|e| AppError::Other(e.to_string()))?
}

const PREVIEW_MAX_BYTES: u64 = 8 * 1024 * 1024;

#[tauri::command]
pub async fn sftp_read_preview(
    manager: State<'_, SftpManager>,
    connection_id: String,
    path: String,
) -> AppResult<Vec<u8>> {
    let conn = manager.get(&connection_id)?;
    tauri::async_runtime::spawn_blocking(move || conn.read_preview(&path, PREVIEW_MAX_BYTES))
        .await
        .map_err(|e| AppError::Other(e.to_string()))?
}
