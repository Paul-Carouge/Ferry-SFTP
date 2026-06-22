//! "Edit in external app" with live re-upload.
//!
//! Downloads a remote file to a temp copy, opens it in the OS default
//! application, then polls the temp file's (size, mtime) signature and
//! re-uploads on every change. Polling — rather than an inotify-style
//! watcher — is deliberate: many editors save by writing a new file and
//! renaming over the original, which breaks watches bound to the inode but
//! is caught reliably by re-stat'ing the path.

use crate::error::{AppError, AppResult};
use crate::sftp::manager::SftpManager;
use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

/// Files larger than this are refused — the whole file is held in memory for
/// each round-trip, and "edit in external app" targets text/config files.
const EDIT_MAX_BYTES: u64 = 64 * 1024 * 1024;
const POLL_INTERVAL: Duration = Duration::from_millis(800);

struct EditHandle {
    connection_id: String,
    stop: Arc<AtomicBool>,
}

#[derive(Default)]
pub struct EditManager(Mutex<HashMap<String, EditHandle>>);

impl EditManager {
    fn insert(&self, id: String, handle: EditHandle) {
        self.0.lock().unwrap().insert(id, handle);
    }

    fn stop(&self, id: &str) {
        if let Some(h) = self.0.lock().unwrap().remove(id) {
            h.stop.store(true, Ordering::Relaxed);
        }
    }

    /// Tears down every watch tied to a connection (called on disconnect).
    pub fn stop_for_connection(&self, connection_id: &str) {
        let mut map = self.0.lock().unwrap();
        let ids: Vec<String> = map
            .iter()
            .filter(|(_, h)| h.connection_id == connection_id)
            .map(|(k, _)| k.clone())
            .collect();
        for id in ids {
            if let Some(h) = map.remove(&id) {
                h.stop.store(true, Ordering::Relaxed);
            }
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditSession {
    id: String,
    name: String,
    remote_path: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct EditSyncEvent {
    id: String,
    name: String,
    remote_path: String,
    ok: bool,
    error: Option<String>,
    at: i64,
}

fn signature(path: &Path) -> Option<(u64, i64)> {
    let meta = std::fs::metadata(path).ok()?;
    let mtime = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    Some((meta.len(), mtime))
}

fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Reduces a server-controlled basename to a single safe on-disk filename:
/// no path separators, no shell metacharacters, no `..`. The original name is
/// still used for the remote upload target and UI; only the temp file is renamed.
fn safe_filename(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| if c.is_alphanumeric() || matches!(c, '.' | '-' | '_' | ' ') { c } else { '_' })
        .collect();
    let trimmed = cleaned.trim_matches(|c| c == '.' || c == ' ');
    if trimmed.is_empty() {
        "ferry-edit".to_string()
    } else {
        trimmed.to_string()
    }
}

fn open_in_default_app(path: &Path) -> AppResult<()> {
    #[cfg(target_os = "macos")]
    let result = std::process::Command::new("open").arg(path).spawn();

    #[cfg(target_os = "windows")]
    let result = std::process::Command::new("cmd").args(["/C", "start", ""]).arg(path).spawn();

    #[cfg(all(unix, not(target_os = "macos")))]
    let result = std::process::Command::new("xdg-open").arg(path).spawn();

    result.map(|_| ()).map_err(|e| AppError::Other(e.to_string()))
}

#[tauri::command]
pub async fn external_edit_start(
    app: AppHandle,
    sftp: State<'_, SftpManager>,
    edits: State<'_, EditManager>,
    connection_id: String,
    remote_path: String,
) -> AppResult<EditSession> {
    let conn = sftp.get(&connection_id)?;
    let id = uuid::Uuid::new_v4().to_string();
    let name = Path::new(&remote_path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| remote_path.clone());

    // Download the current contents (off the async thread — libssh2 is blocking).
    let conn_dl = conn.clone();
    let remote_dl = remote_path.clone();
    let bytes = tauri::async_runtime::spawn_blocking(move || -> AppResult<Vec<u8>> {
        let stat = conn_dl.stat(&remote_dl)?;
        if stat.size > EDIT_MAX_BYTES {
            return Err(AppError::Other(format!(
                "file is too large to edit ({} MB)",
                stat.size / (1024 * 1024)
            )));
        }
        conn_dl.read_preview(&remote_dl, EDIT_MAX_BYTES)
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))??;

    // Each session gets its own temp dir so filenames never collide.
    let dir = std::env::temp_dir().join("ferry-edit").join(&id);
    std::fs::create_dir_all(&dir)?;
    let temp_path = dir.join(safe_filename(&name));
    std::fs::write(&temp_path, &bytes)?;

    open_in_default_app(&temp_path)?;

    let stop = Arc::new(AtomicBool::new(false));
    edits.insert(
        id.clone(),
        EditHandle {
            connection_id: connection_id.clone(),
            stop: stop.clone(),
        },
    );

    let app_t = app.clone();
    let conn_t = conn;
    let id_t = id.clone();
    let name_t = name.clone();
    let remote_t = remote_path.clone();
    std::thread::spawn(move || {
        let emit = |ok: bool, error: Option<String>| {
            let _ = app_t.emit(
                "external-edit:sync",
                EditSyncEvent {
                    id: id_t.clone(),
                    name: name_t.clone(),
                    remote_path: remote_t.clone(),
                    ok,
                    error,
                    at: now_millis(),
                },
            );
        };
        // `uploaded` is the last signature pushed to the server; `pending` is a
        // change awaiting stability. Only upload once a signature repeats across
        // two ticks, so we never push a file mid-write (editor atomic saves).
        let mut uploaded = signature(&temp_path);
        let mut pending: Option<(u64, i64)> = None;
        while !stop.load(Ordering::Relaxed) {
            std::thread::sleep(POLL_INTERVAL);
            if stop.load(Ordering::Relaxed) {
                break;
            }
            let Some(sig) = signature(&temp_path) else { continue };
            if Some(sig) == uploaded {
                pending = None;
                continue;
            }
            if pending != Some(sig) {
                pending = Some(sig);
                continue;
            }
            uploaded = Some(sig);
            pending = None;
            if sig.0 > EDIT_MAX_BYTES {
                emit(false, Some(format!("file is too large to sync ({} MB)", sig.0 / (1024 * 1024))));
                continue;
            }
            match std::fs::read(&temp_path) {
                Ok(content) => {
                    let res = conn_t.write_file(&remote_t, &content);
                    emit(res.is_ok(), res.err().map(|e| e.to_string()));
                }
                Err(e) => emit(false, Some(e.to_string())),
            }
        }
        let _ = std::fs::remove_dir_all(&dir);
    });

    Ok(EditSession {
        id,
        name,
        remote_path,
    })
}

#[tauri::command]
pub fn external_edit_stop(edits: State<'_, EditManager>, id: String) -> AppResult<()> {
    edits.stop(&id);
    Ok(())
}
