pub mod commands;

use crate::error::AppResult;
use crate::sftp::connection::RemoteEntry;
use std::fs;
use std::path::{Path, PathBuf};

const SEARCH_LIMIT: usize = 500;

#[cfg(unix)]
fn mode_of(metadata: &fs::Metadata) -> Option<u32> {
    use std::os::unix::fs::PermissionsExt;
    Some(metadata.permissions().mode())
}

#[cfg(not(unix))]
fn mode_of(_metadata: &fs::Metadata) -> Option<u32> {
    None
}

fn mtime_of(metadata: &fs::Metadata) -> Option<i64> {
    metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
}

fn entry_from_path(path: &Path) -> AppResult<RemoteEntry> {
    let metadata = fs::symlink_metadata(path)?;
    let is_symlink = metadata.file_type().is_symlink();
    let resolved = if is_symlink { fs::metadata(path).ok() } else { Some(metadata.clone()) };
    let is_dir = resolved.as_ref().map(|m| m.is_dir()).unwrap_or(false);
    let size = resolved.as_ref().map(|m| m.len()).unwrap_or(0);

    Ok(RemoteEntry {
        name: path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| path.to_string_lossy().to_string()),
        path: path.to_string_lossy().to_string(),
        is_dir,
        is_symlink,
        size,
        modified: mtime_of(&metadata),
        permissions: mode_of(&metadata),
    })
}

pub fn home_dir() -> AppResult<String> {
    Ok(dirs::home_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "/".to_string()))
}

pub fn list_dir(path: &str) -> AppResult<Vec<RemoteEntry>> {
    let mut out = Vec::new();
    for entry in fs::read_dir(path)? {
        let entry = entry?;
        if let Ok(remote_entry) = entry_from_path(&entry.path()) {
            out.push(remote_entry);
        }
    }
    out.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });
    Ok(out)
}

/// Recursively walks `root` and returns every entry whose name contains
/// `query` (case-insensitive), depth-first, capped at `SEARCH_LIMIT`
/// results. Symlinked directories are listed but not descended into, to
/// avoid cycles.
pub fn search(root: &str, query: &str) -> AppResult<Vec<RemoteEntry>> {
    let mut out = Vec::new();
    let query_lower = query.to_lowercase();
    let mut stack: Vec<PathBuf> = vec![PathBuf::from(root)];

    while let Some(dir) = stack.pop() {
        let Ok(entries) = fs::read_dir(&dir) else { continue };
        for entry in entries.flatten() {
            let path = entry.path();
            let Ok(remote_entry) = entry_from_path(&path) else { continue };

            if remote_entry.name.to_lowercase().contains(&query_lower) {
                out.push(remote_entry.clone());
                if out.len() >= SEARCH_LIMIT {
                    return Ok(out);
                }
            }
            if remote_entry.is_dir && !remote_entry.is_symlink {
                stack.push(path);
            }
        }
    }

    Ok(out)
}

pub fn stat(path: &str) -> AppResult<RemoteEntry> {
    entry_from_path(Path::new(path))
}

pub fn mkdir(path: &str) -> AppResult<()> {
    fs::create_dir(path)?;
    Ok(())
}

pub fn remove(path: &str, is_dir: bool) -> AppResult<()> {
    if is_dir {
        fs::remove_dir_all(path)?;
    } else {
        fs::remove_file(path)?;
    }
    Ok(())
}

pub fn rename(from: &str, to: &str) -> AppResult<()> {
    fs::rename(from, to)?;
    Ok(())
}

pub fn read_preview(path: &str, max_bytes: u64) -> AppResult<Vec<u8>> {
    use std::io::Read;
    let mut file = fs::File::open(path)?;
    let mut buf = Vec::new();
    let mut chunk = [0u8; 64 * 1024];
    loop {
        if buf.len() as u64 >= max_bytes {
            break;
        }
        let n = file.read(&mut chunk)?;
        if n == 0 {
            break;
        }
        buf.extend_from_slice(&chunk[..n]);
    }
    Ok(buf)
}
