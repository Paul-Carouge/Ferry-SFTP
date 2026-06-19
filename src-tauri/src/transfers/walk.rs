use crate::error::AppResult;
use crate::sftp::connection::SftpConnection;
use std::path::{Path, PathBuf};

pub struct WalkEntry {
    pub rel_path: String,
    pub is_dir: bool,
    pub size: u64,
}

fn rel_path(root: &Path, full: &Path) -> String {
    full.strip_prefix(root)
        .unwrap_or(full)
        .to_string_lossy()
        .replace('\\', "/")
}

/// Recursively walks `root` and returns every entry below it (not `root`
/// itself), parent directories appearing before their children so callers
/// can create directories top-down before placing files inside them.
/// Symlinked directories are listed but not descended into, to avoid cycles.
pub fn walk_local(root: &str) -> AppResult<Vec<WalkEntry>> {
    let root_path = PathBuf::from(root);
    let mut out = Vec::new();
    let mut stack: Vec<PathBuf> = vec![root_path.clone()];

    while let Some(dir) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else { continue };
        for entry in entries.flatten() {
            let path = entry.path();
            let Ok(metadata) = std::fs::symlink_metadata(&path) else { continue };
            let is_symlink = metadata.file_type().is_symlink();
            let resolved = if is_symlink { std::fs::metadata(&path).ok() } else { Some(metadata) };
            let is_dir = resolved.as_ref().map(|m| m.is_dir()).unwrap_or(false);
            let size = resolved.as_ref().map(|m| m.len()).unwrap_or(0);

            out.push(WalkEntry {
                rel_path: rel_path(&root_path, &path),
                is_dir,
                size,
            });
            if is_dir && !is_symlink {
                stack.push(path);
            }
        }
    }

    Ok(out)
}

/// Remote equivalent of [`walk_local`], same ordering and symlink rule.
pub fn walk_remote(conn: &SftpConnection, root: &str) -> AppResult<Vec<WalkEntry>> {
    let root_path = PathBuf::from(root);
    let mut out = Vec::new();
    let mut stack: Vec<PathBuf> = vec![root_path.clone()];

    while let Some(dir) = stack.pop() {
        let Ok(entries) = conn.sftp().readdir(&dir) else { continue };
        for (full_path, stat) in entries {
            let is_dir = stat.is_dir();
            let is_symlink = stat.file_type().is_symlink();

            out.push(WalkEntry {
                rel_path: rel_path(&root_path, &full_path),
                is_dir,
                size: stat.size.unwrap_or(0),
            });
            if is_dir && !is_symlink {
                stack.push(full_path);
            }
        }
    }

    Ok(out)
}
