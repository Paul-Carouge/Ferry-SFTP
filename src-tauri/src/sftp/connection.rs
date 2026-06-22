use crate::error::{AppError, AppResult};
use serde::Serialize;
use ssh2::{KeyboardInteractivePrompt, Prompt, Session, Sftp};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::time::Duration;

const SEARCH_LIMIT: usize = 500;

pub enum Auth {
    Password(String),
    Key {
        key_path: String,
        passphrase: Option<String>,
    },
    /// Authenticate via a running SSH agent (ssh-agent / SSH_AUTH_SOCK).
    Agent,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub is_symlink: bool,
    pub size: u64,
    pub modified: Option<i64>,
    pub permissions: Option<u32>,
    /// For symlinks, the raw target path it points to (one hop, not resolved).
    /// `None` for non-symlinks or when the target can't be read.
    pub symlink_target: Option<String>,
}

/// Wraps a connected SFTP session. `Session`/`Sftp` are internally
/// `Arc<Mutex<..>>`-backed by libssh2 itself and `Send + Sync`, so this
/// type is safe to share across threads (behind an `Arc`) without an
/// extra lock of our own.
pub struct SftpConnection {
    session: Session,
    sftp: Sftp,
    home_dir: String,
}

/// Answers every keyboard-interactive prompt with the supplied password.
/// Several hosts (notably shared SFTP-only accounts, e.g. OVH) advertise
/// only `keyboard-interactive` rather than `password` for auth — a plain
/// `userauth_password` call against those servers fails even with correct
/// credentials, so this fallback is required for them to connect at all.
struct PasswordPrompter<'a>(&'a str);

impl KeyboardInteractivePrompt for PasswordPrompter<'_> {
    fn prompt<'b>(
        &mut self,
        _username: &str,
        _instructions: &str,
        prompts: &[Prompt<'b>],
    ) -> Vec<String> {
        prompts.iter().map(|_| self.0.to_string()).collect()
    }
}

/// SHA-256 fingerprint of a session's host key, formatted as lowercase hex.
/// Uses libssh2's own digest (no extra hashing crate). Returns `None` only
/// if the server somehow exposed no host key.
pub fn fingerprint_hex(session: &Session) -> Option<String> {
    session
        .host_key_hash(ssh2::HashType::Sha256)
        .map(|bytes| bytes.iter().map(|b| format!("{b:02x}")).collect())
}

impl SftpConnection {
    /// TCP connect + SSH handshake, with no authentication yet — so the
    /// caller can inspect the host key fingerprint (TOFU) before committing
    /// credentials.
    pub fn handshake_only(host: &str, port: u16) -> AppResult<Session> {
        let tcp = TcpStream::connect((host, port))?;
        tcp.set_read_timeout(Some(Duration::from_secs(30)))?;
        tcp.set_write_timeout(Some(Duration::from_secs(30)))?;

        let mut session = Session::new().map_err(AppError::Ssh)?;
        // Negotiate zlib compression when the server supports it — a clear win
        // over slower links for compressible payloads; no-op otherwise. Must be
        // set before the handshake.
        session.set_compress(true);
        session.set_tcp_stream(tcp);
        session.handshake().map_err(AppError::Ssh)?;
        Ok(session)
    }

    /// Single-call connect (handshake + auth), kept for completeness; the
    /// command layer uses the split form to interpose a host-key check.
    #[allow(dead_code)]
    pub fn connect(host: &str, port: u16, username: &str, auth: Auth) -> AppResult<Self> {
        let session = Self::handshake_only(host, port)?;
        Self::finish_connect(session, username, auth)
    }

    /// Authenticates an already-handshaked session and opens SFTP.
    pub fn finish_connect(session: Session, username: &str, auth: Auth) -> AppResult<Self> {
        match auth {
            Auth::Password(password) => {
                let methods = session.auth_methods(username).unwrap_or("");
                let try_password = methods.is_empty() || methods.contains("password");
                let try_kbd_interactive = methods.contains("keyboard-interactive");

                let mut last_err = None;
                if try_password {
                    if let Err(e) = session.userauth_password(username, &password) {
                        last_err = Some(e);
                    }
                }
                if !session.authenticated() && (try_kbd_interactive || !try_password) {
                    let mut prompter = PasswordPrompter(&password);
                    if let Err(e) = session.userauth_keyboard_interactive(username, &mut prompter)
                    {
                        last_err = Some(e);
                    }
                }
                if !session.authenticated() {
                    if let Some(e) = last_err {
                        return Err(AppError::Ssh(e));
                    }
                }
            }
            Auth::Key {
                key_path,
                passphrase,
            } => {
                session.userauth_pubkey_file(
                    username,
                    None,
                    Path::new(&key_path),
                    passphrase.as_deref(),
                )?;
            }
            Auth::Agent => {
                // Tries every identity the agent holds until one authenticates.
                session.userauth_agent(username)?;
            }
        }

        if !session.authenticated() {
            return Err(AppError::Other("authentication failed".into()));
        }

        let sftp = session.sftp()?;
        // The server's reported home directory, not "/" — many SFTP-only
        // accounts (chrooted or path-restricted, e.g. OVH) deny listing the
        // filesystem root entirely even though the account itself is valid,
        // which otherwise surfaces as a misleading "permission denied" on
        // the very first directory load.
        let home_dir = sftp
            .realpath(Path::new("."))
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|_| "/".to_string());

        Ok(Self {
            session,
            sftp,
            home_dir,
        })
    }

    pub fn disconnect(&self) {
        let _ = self.session.disconnect(None, "bye", None);
    }

    pub fn sftp(&self) -> &Sftp {
        &self.sftp
    }

    pub fn home_dir(&self) -> &str {
        &self.home_dir
    }

    pub fn list_dir(&self, path: &str) -> AppResult<Vec<RemoteEntry>> {
        let entries = self.sftp.readdir(Path::new(path))?;
        let mut out: Vec<RemoteEntry> = entries
            .into_iter()
            .map(|(full_path, stat)| {
                let name = full_path
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();
                let is_symlink = stat.file_type().is_symlink();
                RemoteEntry {
                    name,
                    is_dir: stat.is_dir(),
                    is_symlink,
                    size: stat.size.unwrap_or(0),
                    modified: stat.mtime.map(|t| t as i64),
                    permissions: stat.perm,
                    symlink_target: if is_symlink {
                        self.sftp
                            .readlink(&full_path)
                            .ok()
                            .map(|p| p.to_string_lossy().to_string())
                    } else {
                        None
                    },
                    path: full_path.to_string_lossy().to_string(),
                }
            })
            .collect();
        out.sort_by(|a, b| match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        });
        Ok(out)
    }

    /// Recursively walks `root` and returns every entry whose name contains
    /// `query` (case-insensitive), capped at `SEARCH_LIMIT` results.
    /// Symlinked directories are listed but not descended into, to avoid
    /// cycles.
    pub fn search(&self, root: &str, query: &str) -> AppResult<Vec<RemoteEntry>> {
        let mut out = Vec::new();
        let query_lower = query.to_lowercase();
        let mut stack: Vec<PathBuf> = vec![PathBuf::from(root)];

        while let Some(dir) = stack.pop() {
            let Ok(entries) = self.sftp.readdir(&dir) else { continue };
            for (full_path, stat) in entries {
                let name = full_path
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();
                let is_dir = stat.is_dir();
                let is_symlink = stat.file_type().is_symlink();

                if name.to_lowercase().contains(&query_lower) {
                    out.push(RemoteEntry {
                        name,
                        path: full_path.to_string_lossy().to_string(),
                        is_dir,
                        is_symlink,
                        size: stat.size.unwrap_or(0),
                        modified: stat.mtime.map(|t| t as i64),
                        permissions: stat.perm,
                        symlink_target: None,
                    });
                    if out.len() >= SEARCH_LIMIT {
                        return Ok(out);
                    }
                }
                if is_dir && !is_symlink {
                    stack.push(full_path);
                }
            }
        }

        Ok(out)
    }

    pub fn stat(&self, path: &str) -> AppResult<RemoteEntry> {
        // `lstat` so a symlink reports as a symlink (and we can read its
        // target) rather than silently resolving to what it points at.
        let stat = self.sftp.lstat(Path::new(path))?;
        let name = Path::new(path)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| path.to_string());
        let is_symlink = stat.file_type().is_symlink();
        Ok(RemoteEntry {
            name,
            path: path.to_string(),
            is_dir: stat.is_dir(),
            is_symlink,
            size: stat.size.unwrap_or(0),
            modified: stat.mtime.map(|t| t as i64),
            permissions: stat.perm,
            symlink_target: if is_symlink {
                self.sftp
                    .readlink(Path::new(path))
                    .ok()
                    .map(|p| p.to_string_lossy().to_string())
            } else {
                None
            },
        })
    }

    pub fn mkdir(&self, path: &str) -> AppResult<()> {
        self.sftp.mkdir(Path::new(path), 0o755)?;
        Ok(())
    }

    pub fn remove_file(&self, path: &str) -> AppResult<()> {
        self.sftp.unlink(Path::new(path))?;
        Ok(())
    }

    pub fn remove_dir(&self, path: &str) -> AppResult<()> {
        self.sftp.rmdir(Path::new(path))?;
        Ok(())
    }

    pub fn rename(&self, from: &str, to: &str) -> AppResult<()> {
        self.sftp.rename(Path::new(from), Path::new(to), None)?;
        Ok(())
    }

    /// Copies a remote file or directory tree to another remote path. libssh2
    /// has no server-side copy, so bytes stream through the client over the
    /// same session — universal (works on chrooted SFTP-only accounts) at the
    /// cost of round-tripping the data.
    pub fn copy(&self, from: &str, to: &str) -> AppResult<()> {
        let from = Path::new(from);
        let to = Path::new(to);
        let stat = self.sftp.lstat(from)?;
        if stat.is_dir() {
            self.copy_dir(from, to)
        } else {
            self.copy_file(from, to)
        }
    }

    fn copy_file(&self, from: &Path, to: &Path) -> AppResult<()> {
        use std::io::{Read, Write};
        let mut src = self.sftp.open(from)?;
        let mut dst = self.sftp.create(to)?;
        let mut chunk = [0u8; 256 * 1024];
        loop {
            let n = src.read(&mut chunk)?;
            if n == 0 {
                break;
            }
            dst.write_all(&chunk[..n])?;
        }
        Ok(())
    }

    fn copy_dir(&self, from: &Path, to: &Path) -> AppResult<()> {
        // Ignore "already exists" so copying into a partially-present tree works.
        let _ = self.sftp.mkdir(to, 0o755);
        for (child, stat) in self.sftp.readdir(from)? {
            let Some(name) = child.file_name() else { continue };
            let dst_child = to.join(name);
            if stat.is_dir() {
                self.copy_dir(&child, &dst_child)?;
            } else {
                self.copy_file(&child, &dst_child)?;
            }
        }
        Ok(())
    }

    pub fn chmod(&self, path: &str, mode: u32) -> AppResult<()> {
        let mut stat = self.sftp.stat(Path::new(path))?;
        stat.perm = Some(mode);
        self.sftp.setstat(Path::new(path), stat)?;
        Ok(())
    }

    /// Downloads a remote file or directory tree to a local path (recursive).
    /// Used to stage remote files in a temp dir for native drag-out.
    pub fn download_path(&self, remote: &str, local: &Path) -> AppResult<()> {
        let remote_path = Path::new(remote);
        let stat = self.sftp.lstat(remote_path)?;
        if stat.is_dir() {
            std::fs::create_dir_all(local)?;
            for (child, cstat) in self.sftp.readdir(remote_path)? {
                let Some(name) = child.file_name() else { continue };
                let local_child = local.join(name);
                if cstat.is_dir() {
                    self.download_path(&child.to_string_lossy(), &local_child)?;
                } else {
                    self.download_file_to(&child.to_string_lossy(), &local_child)?;
                }
            }
            Ok(())
        } else {
            if let Some(parent) = local.parent() {
                std::fs::create_dir_all(parent)?;
            }
            self.download_file_to(remote, local)
        }
    }

    fn download_file_to(&self, remote: &str, local: &Path) -> AppResult<()> {
        use std::io::{Read, Write};
        let mut src = self.sftp.open(Path::new(remote))?;
        let mut dst = std::fs::File::create(local)?;
        let mut chunk = [0u8; 256 * 1024];
        loop {
            let n = src.read(&mut chunk)?;
            if n == 0 {
                break;
            }
            dst.write_all(&chunk[..n])?;
        }
        Ok(())
    }

    /// Reads up to `max_bytes` of a remote file into memory, for previews.
    pub fn read_preview(&self, path: &str, max_bytes: u64) -> AppResult<Vec<u8>> {
        use std::io::Read;
        let mut file = self.sftp.open(Path::new(path))?;
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

    pub fn write_file(&self, path: &str, content: &[u8]) -> AppResult<()> {
        use std::io::Write;
        let mut file = self.sftp().create(std::path::Path::new(path))?;
        file.write_all(content)?;
        Ok(())
    }
}
