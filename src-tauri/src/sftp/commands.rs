use super::connection::{fingerprint_hex, Auth, RemoteEntry, SftpConnection};
use super::manager::SftpManager;
use crate::error::{AppError, AppResult};
use crate::store;
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
    /// Saved-profile id, if connecting from a saved profile — used to look
    /// up / store the trusted host key fingerprint (TOFU). `None` for ad-hoc
    /// quick connects, which skip host-key persistence.
    pub profile_id: Option<String>,
    /// Set true on the second connect call, after the user accepted the
    /// first-time host-key trust prompt.
    pub trust_host_key: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
// `rename_all` on an enum renames the VARIANT tags (Connected -> "connected");
// `rename_all_fields` is required to also camelCase the struct-variant fields
// (connection_id -> "connectionId"), which the frontend reads.
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum ConnectOutcome {
    Connected {
        connection_id: String,
        home_dir: String,
    },
    /// First connection to this profile's host — frontend must show a trust
    /// prompt, then re-call with `trustHostKey: true`.
    HostKeyPrompt {
        fingerprint: String,
    },
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

/// Result of the blocking handshake+verify+auth step, kept off the
/// `Session` type so nothing non-`Send`-sensitive crosses the await point.
enum HandshakeOutcome {
    /// Authenticated. `store_fingerprint` is `Some` when a first-time TOFU
    /// fingerprint should be persisted to the profile after success.
    Connected(SftpConnection, Option<String>),
    /// First time seeing this host — prompt the user.
    Prompt(String),
    /// Stored fingerprint did not match the server's.
    Mismatch { expected: String, actual: String },
}

#[tauri::command]
pub async fn sftp_connect(
    app: AppHandle,
    manager: State<'_, SftpManager>,
    input: ConnectInput,
) -> AppResult<ConnectOutcome> {
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
    let host_for_error = host.clone();
    let port = input.port;
    let username = input.username;
    // Only saved profiles carry a trust anchor; quick connects skip TOFU.
    let stored_fingerprint = input
        .profile_id
        .as_ref()
        .and_then(|id| store::host_key_fingerprint_for(&app, id));
    let trust_requested = input.trust_host_key.unwrap_or(false);
    let has_profile = input.profile_id.is_some();

    let result = tauri::async_runtime::spawn_blocking(move || -> AppResult<HandshakeOutcome> {
        let session = SftpConnection::handshake_only(&host, port)?;
        let fingerprint = fingerprint_hex(&session)
            .ok_or_else(|| AppError::Other("server provided no host key".into()))?;

        match &stored_fingerprint {
            Some(expected) if expected != &fingerprint => {
                return Ok(HandshakeOutcome::Mismatch {
                    expected: expected.clone(),
                    actual: fingerprint,
                });
            }
            // No stored fingerprint, on a saved profile, not yet trusted:
            // ask the user before sending credentials.
            None if has_profile && !trust_requested => {
                return Ok(HandshakeOutcome::Prompt(fingerprint));
            }
            _ => {}
        }

        let conn = SftpConnection::finish_connect(session, &username, auth)?;
        // Persist the fingerprint only on a first-time trust acceptance.
        let to_store = if has_profile && stored_fingerprint.is_none() {
            Some(fingerprint)
        } else {
            None
        };
        Ok(HandshakeOutcome::Connected(conn, to_store))
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))?;

    match result {
        Ok(HandshakeOutcome::Connected(conn, to_store)) => {
            let home_dir = conn.home_dir().to_string();
            manager.insert(connection_id.clone(), conn);
            if let (Some(fingerprint), Some(id)) = (to_store, input.profile_id.as_ref()) {
                let _ = store::set_host_key_fingerprint(&app, id, fingerprint);
            }
            emit_status(&app, &connection_id, "connected", None);
            Ok(ConnectOutcome::Connected {
                connection_id,
                home_dir,
            })
        }
        Ok(HandshakeOutcome::Prompt(fingerprint)) => {
            // Not connected; clear the transient "connecting" status so the UI
            // doesn't show a stuck spinner behind the trust dialog.
            emit_status(&app, &connection_id, "disconnected", None);
            Ok(ConnectOutcome::HostKeyPrompt { fingerprint })
        }
        Ok(HandshakeOutcome::Mismatch { expected, actual }) => {
            let err = AppError::HostKeyMismatch {
                host: host_for_error,
                expected,
                actual,
            };
            emit_status(&app, &connection_id, "error", Some(err.to_string()));
            Err(err)
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

#[cfg(test)]
mod tests {
    use super::ConnectOutcome;

    // Guards the camelCase wire contract the frontend depends on. An enum's
    // `rename_all` only renames variant tags, so without `rename_all_fields`
    // the struct fields stay snake_case and `connectionId` reads as undefined
    // in JS — which silently breaks every connectionId-keyed command.
    #[test]
    fn connect_outcome_serializes_camel_case() {
        let connected = ConnectOutcome::Connected {
            connection_id: "abc".into(),
            home_dir: "/home".into(),
        };
        let json = serde_json::to_value(&connected).unwrap();
        assert_eq!(json["kind"], "connected");
        assert_eq!(json["connectionId"], "abc");
        assert_eq!(json["homeDir"], "/home");

        let prompt = ConnectOutcome::HostKeyPrompt {
            fingerprint: "ff".into(),
        };
        let json = serde_json::to_value(&prompt).unwrap();
        assert_eq!(json["kind"], "hostKeyPrompt");
        assert_eq!(json["fingerprint"], "ff");
    }
}
