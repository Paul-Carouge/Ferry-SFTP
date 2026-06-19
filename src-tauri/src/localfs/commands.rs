use crate::error::{AppError, AppResult};
use crate::sftp::connection::RemoteEntry;

#[tauri::command]
pub fn local_home_dir() -> AppResult<String> {
    super::home_dir()
}

#[tauri::command]
pub async fn local_list_dir(path: String) -> AppResult<Vec<RemoteEntry>> {
    tauri::async_runtime::spawn_blocking(move || super::list_dir(&path))
        .await
        .map_err(|e| AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn local_search(path: String, query: String) -> AppResult<Vec<RemoteEntry>> {
    tauri::async_runtime::spawn_blocking(move || super::search(&path, &query))
        .await
        .map_err(|e| AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn local_stat(path: String) -> AppResult<RemoteEntry> {
    tauri::async_runtime::spawn_blocking(move || super::stat(&path))
        .await
        .map_err(|e| AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn local_mkdir(path: String) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || super::mkdir(&path))
        .await
        .map_err(|e| AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn local_remove(path: String, is_dir: bool) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || super::remove(&path, is_dir))
        .await
        .map_err(|e| AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn local_rename(from: String, to: String) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || super::rename(&from, &to))
        .await
        .map_err(|e| AppError::Other(e.to_string()))?
}

const PREVIEW_MAX_BYTES: u64 = 8 * 1024 * 1024;

#[tauri::command]
pub async fn local_read_preview(path: String) -> AppResult<Vec<u8>> {
    tauri::async_runtime::spawn_blocking(move || super::read_preview(&path, PREVIEW_MAX_BYTES))
        .await
        .map_err(|e| AppError::Other(e.to_string()))?
}
