use super::walk;
use super::{
    spawn_enqueue, spawn_enqueue_job, TransferDirection, TransferJob, TransferManager, TransferRecord,
};
use crate::error::{AppError, AppResult};
use crate::sftp::manager::SftpManager;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn join_path(root: &str, rel: &str) -> String {
    if rel.is_empty() {
        return root.trim_end_matches('/').to_string();
    }
    format!("{}/{}", root.trim_end_matches('/'), rel)
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
        None,
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
        None,
    ))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferPlanItem {
    pub local_path: String,
    pub remote_path: String,
    pub size: u64,
    pub is_dir: bool,
}

/// Walks `local_root`/`remote_root` (whichever side is the source for
/// `direction`) and returns every entry below it, plus the root itself as
/// the first item (`isDir: true`), so the caller can create the
/// destination root and any empty subdirectories. Does not enqueue anything.
#[tauri::command]
pub async fn transfer_plan_folder(
    sftp_manager: State<'_, SftpManager>,
    connection_id: String,
    direction: TransferDirection,
    local_root: String,
    remote_root: String,
) -> AppResult<Vec<TransferPlanItem>> {
    let entries = match direction {
        TransferDirection::Upload => {
            let root_for_walk = local_root.clone();
            tauri::async_runtime::spawn_blocking(move || walk::walk_local(&root_for_walk))
                .await
                .map_err(|e| AppError::Other(e.to_string()))??
        }
        TransferDirection::Download => {
            let conn = sftp_manager.get(&connection_id)?;
            let root_for_walk = remote_root.clone();
            tauri::async_runtime::spawn_blocking(move || walk::walk_remote(&conn, &root_for_walk))
                .await
                .map_err(|e| AppError::Other(e.to_string()))??
        }
    };

    let mut items = vec![TransferPlanItem {
        local_path: local_root.clone(),
        remote_path: remote_root.clone(),
        size: 0,
        is_dir: true,
    }];
    items.extend(entries.into_iter().map(|e| TransferPlanItem {
        local_path: join_path(&local_root, &e.rel_path),
        remote_path: join_path(&remote_root, &e.rel_path),
        size: e.size,
        is_dir: e.is_dir,
    }));

    Ok(items)
}

/// Checks which file (not directory) destinations in `items` already exist,
/// so the frontend can prompt skip/overwrite/rename before anything is
/// enqueued. Returns the conflicting destination paths (remote for Upload,
/// local for Download).
#[tauri::command]
pub async fn transfer_check_conflicts(
    sftp_manager: State<'_, SftpManager>,
    connection_id: String,
    direction: TransferDirection,
    items: Vec<TransferPlanItem>,
) -> AppResult<Vec<String>> {
    let files: Vec<TransferPlanItem> = items.into_iter().filter(|i| !i.is_dir).collect();
    match direction {
        TransferDirection::Upload => {
            let conn = sftp_manager.get(&connection_id)?;
            tauri::async_runtime::spawn_blocking(move || {
                files
                    .into_iter()
                    .filter(|i| conn.stat(&i.remote_path).is_ok())
                    .map(|i| i.remote_path)
                    .collect()
            })
            .await
            .map_err(|e| AppError::Other(e.to_string()))
        }
        TransferDirection::Download => tauri::async_runtime::spawn_blocking(move || {
            files
                .into_iter()
                .filter(|i| std::fs::metadata(&i.local_path).is_ok())
                .map(|i| i.local_path)
                .collect()
        })
        .await
        .map_err(|e| AppError::Other(e.to_string())),
    }
}

/// Creates every directory in `items` (including the root, best-effort —
/// already-exists is not an error here) then enqueues every file as one
/// `TransferJob`. `items` must already have conflicts resolved (skip
/// entries removed, renamed paths substituted) by the caller.
#[tauri::command]
pub async fn transfer_enqueue_resolved(
    app: AppHandle,
    sftp_manager: State<'_, SftpManager>,
    connection_id: String,
    direction: TransferDirection,
    items: Vec<TransferPlanItem>,
) -> AppResult<String> {
    let root_local = items
        .first()
        .map(|i| i.local_path.clone())
        .ok_or_else(|| AppError::InvalidInput("nothing to transfer".into()))?;
    let root_remote = items.first().map(|i| i.remote_path.clone()).unwrap_or_default();

    let dirs: Vec<TransferPlanItem> = items.iter().filter(|i| i.is_dir).cloned().collect();
    let files: Vec<(String, String, u64)> = items
        .iter()
        .filter(|i| !i.is_dir)
        .map(|i| (i.local_path.clone(), i.remote_path.clone(), i.size))
        .collect();

    if files.is_empty() {
        return Err(AppError::InvalidInput("nothing to transfer".into()));
    }

    match direction {
        TransferDirection::Upload => {
            let conn = sftp_manager.get(&connection_id)?;
            let remote_dirs: Vec<String> = dirs.into_iter().map(|d| d.remote_path).collect();
            tauri::async_runtime::spawn_blocking(move || {
                for path in remote_dirs {
                    let _ = conn.mkdir(&path);
                }
            })
            .await
            .map_err(|e| AppError::Other(e.to_string()))?;
        }
        TransferDirection::Download => {
            let local_dirs: Vec<String> = dirs.into_iter().map(|d| d.local_path).collect();
            tauri::async_runtime::spawn_blocking(move || {
                for path in local_dirs {
                    let _ = std::fs::create_dir_all(&path);
                }
            })
            .await
            .map_err(|e| AppError::Other(e.to_string()))?;
        }
    }

    Ok(spawn_enqueue_job(
        app,
        connection_id,
        direction,
        root_local,
        root_remote,
        files,
        now_ms(),
    ))
}

#[tauri::command]
pub fn transfer_job_list(manager: State<'_, TransferManager>) -> Vec<TransferJob> {
    manager.list_jobs()
}

#[tauri::command]
pub fn transfer_cancel_job(manager: State<'_, TransferManager>, job_id: String) -> AppResult<()> {
    manager.cancel_job(&job_id)
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
pub fn transfer_retry(app: tauri::AppHandle, id: String) -> AppResult<()> {
    super::spawn_retry(app, id)
}

#[tauri::command]
pub fn transfer_list(manager: State<'_, TransferManager>) -> Vec<TransferRecord> {
    manager.list()
}
