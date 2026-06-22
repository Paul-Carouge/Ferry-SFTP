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

#[tauri::command]
pub async fn local_write_file(path: String, content: Vec<u8>) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || std::fs::write(&path, &content).map_err(Into::into))
        .await
        .map_err(|e| AppError::Other(e.to_string()))?
}

/// Reveal a path in the OS file manager (Finder/Explorer/file manager), selecting it.
#[tauri::command]
pub fn local_reveal(path: String) -> AppResult<()> {
    #[cfg(target_os = "macos")]
    let result = std::process::Command::new("open").arg("-R").arg(&path).spawn();

    #[cfg(target_os = "windows")]
    let result = std::process::Command::new("explorer")
        .arg(format!("/select,{path}"))
        .spawn();

    #[cfg(all(unix, not(target_os = "macos")))]
    let result = {
        // No portable "select" on Linux; open the containing directory.
        let dir = std::path::Path::new(&path)
            .parent()
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|| std::path::PathBuf::from(&path));
        std::process::Command::new("xdg-open").arg(dir).spawn()
    };

    result.map(|_| ()).map_err(|e| AppError::Other(e.to_string()))
}

/// Open a system terminal at the given directory.
#[tauri::command]
pub fn local_open_terminal(path: String) -> AppResult<()> {
    #[cfg(target_os = "macos")]
    let result = std::process::Command::new("open")
        .arg("-a")
        .arg("Terminal")
        .arg(&path)
        .spawn();

    #[cfg(target_os = "windows")]
    let result = std::process::Command::new("cmd")
        .args(["/C", "start", "cmd", "/K", "cd", "/D"])
        .arg(&path)
        .spawn();

    #[cfg(all(unix, not(target_os = "macos")))]
    let result = std::process::Command::new("x-terminal-emulator")
        .current_dir(&path)
        .spawn();

    result.map(|_| ()).map_err(|e| AppError::Other(e.to_string()))
}

/// Open a path with the OS default application.
#[tauri::command]
pub fn local_open(path: String) -> AppResult<()> {
    #[cfg(target_os = "macos")]
    let result = std::process::Command::new("open").arg(&path).spawn();

    #[cfg(target_os = "windows")]
    let result = std::process::Command::new("cmd").args(["/C", "start", ""]).arg(&path).spawn();

    #[cfg(all(unix, not(target_os = "macos")))]
    let result = std::process::Command::new("xdg-open").arg(&path).spawn();

    result.map(|_| ()).map_err(|e| AppError::Other(e.to_string()))
}
