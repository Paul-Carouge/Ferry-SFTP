use super::{spawn_enqueue, TransferDirection, TransferManager, TransferRecord};
use crate::error::{AppError, AppResult};
use crate::sftp::manager::SftpManager;
use tauri::{AppHandle, State};

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[tauri::command]
pub fn transfer_enqueue_upload(
    app: AppHandle,
    connection_id: String,
    local_path: String,
    remote_path: String,
) -> AppResult<String> {
    let total_bytes = std::fs::metadata(&local_path)?.len();
    Ok(spawn_enqueue(
        app,
        connection_id,
        TransferDirection::Upload,
        local_path,
        remote_path,
        total_bytes,
        now_ms(),
    ))
}

#[tauri::command]
pub async fn transfer_enqueue_download(
    app: AppHandle,
    sftp_manager: State<'_, SftpManager>,
    connection_id: String,
    remote_path: String,
    local_path: String,
) -> AppResult<String> {
    let conn = sftp_manager.get(&connection_id)?;
    let remote_path_for_stat = remote_path.clone();
    let total_bytes = tauri::async_runtime::spawn_blocking(move || conn.stat(&remote_path_for_stat))
        .await
        .map_err(|e| AppError::Other(e.to_string()))??
        .size;

    Ok(spawn_enqueue(
        app,
        connection_id,
        TransferDirection::Download,
        local_path,
        remote_path,
        total_bytes,
        now_ms(),
    ))
}

#[tauri::command]
pub fn transfer_pause(manager: State<'_, TransferManager>, id: String) -> AppResult<()> {
    manager.pause(&id)?;
    Ok(())
}

#[tauri::command]
pub fn transfer_resume(manager: State<'_, TransferManager>, id: String) -> AppResult<()> {
    manager.resume(&id)?;
    Ok(())
}

#[tauri::command]
pub fn transfer_cancel(manager: State<'_, TransferManager>, id: String) -> AppResult<()> {
    manager.cancel(&id)?;
    Ok(())
}

#[tauri::command]
pub fn transfer_list(manager: State<'_, TransferManager>) -> Vec<TransferRecord> {
    manager.list()
}
