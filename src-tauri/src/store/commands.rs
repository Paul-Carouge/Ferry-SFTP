use super::{secrets, AuthMethod, ConnectionProfile};
use crate::error::AppResult;
use serde::Deserialize;
use tauri::AppHandle;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveConnectionInput {
    pub id: Option<String>,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_method: AuthMethod,
    pub key_path: Option<String>,
    pub default_remote_path: Option<String>,
    pub color: Option<String>,
    pub favorite: bool,
    /// Plaintext password or key passphrase, written to the OS keychain (never persisted to disk).
    pub secret: Option<String>,
}

#[tauri::command]
pub fn list_connections(app: AppHandle) -> AppResult<Vec<ConnectionProfile>> {
    super::load(&app)
}

#[tauri::command]
pub fn save_connection(
    app: AppHandle,
    input: SaveConnectionInput,
) -> AppResult<Vec<ConnectionProfile>> {
    let existing = input
        .id
        .as_ref()
        .and_then(|id| super::load(&app).ok().and_then(|p| p.into_iter().find(|p| &p.id == id)));

    let id = input.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let created_at = existing
        .as_ref()
        .map(|p| p.created_at)
        .unwrap_or_else(now_ms);

    let profile = ConnectionProfile {
        id: id.clone(),
        name: input.name,
        host: input.host,
        port: input.port,
        username: input.username,
        auth_method: input.auth_method,
        key_path: input.key_path,
        default_remote_path: input.default_remote_path,
        color: input.color,
        favorite: input.favorite,
        created_at,
        last_connected_at: existing.and_then(|p| p.last_connected_at),
    };

    if let Some(secret) = input.secret {
        let kind = match profile.auth_method {
            AuthMethod::Password => secrets::SecretKind::Password,
            AuthMethod::Key => secrets::SecretKind::Passphrase,
        };
        secrets::set_secret(&id, kind, &secret)?;
    }

    super::upsert(&app, profile)
}

#[tauri::command]
pub fn delete_connection(app: AppHandle, id: String) -> AppResult<Vec<ConnectionProfile>> {
    super::delete(&app, &id)
}

#[tauri::command]
pub fn get_connection_secret(id: String, auth_method: AuthMethod) -> AppResult<Option<String>> {
    let kind = match auth_method {
        AuthMethod::Password => secrets::SecretKind::Password,
        AuthMethod::Key => secrets::SecretKind::Passphrase,
    };
    secrets::get_secret(&id, kind)
}

#[tauri::command]
pub fn touch_connection(app: AppHandle, id: String) -> AppResult<Vec<ConnectionProfile>> {
    super::touch_last_connected(&app, &id, now_ms())
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}
