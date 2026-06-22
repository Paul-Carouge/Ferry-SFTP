pub mod commands;
pub mod secrets;

use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::fs;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AuthMethod {
    Password,
    Key,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionProfile {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_method: AuthMethod,
    pub key_path: Option<String>,
    pub default_remote_path: Option<String>,
    pub color: Option<String>,
    pub favorite: bool,
    pub created_at: i64,
    pub last_connected_at: Option<i64>,
    /// SHA-256 fingerprint of the server's host key, trusted on first
    /// connect (TOFU). `#[serde(default)]` so profiles saved before this
    /// field existed still deserialize.
    #[serde(default)]
    pub host_key_fingerprint: Option<String>,
}

fn store_path(app: &AppHandle) -> AppResult<std::path::PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Other(e.to_string()))?;
    fs::create_dir_all(&dir)?;
    Ok(dir.join("connections.json"))
}

pub fn load(app: &AppHandle) -> AppResult<Vec<ConnectionProfile>> {
    let path = store_path(app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let raw = fs::read_to_string(path)?;
    if raw.trim().is_empty() {
        return Ok(Vec::new());
    }
    Ok(serde_json::from_str(&raw)?)
}

fn persist(app: &AppHandle, profiles: &[ConnectionProfile]) -> AppResult<()> {
    let path = store_path(app)?;
    let raw = serde_json::to_string_pretty(profiles)?;
    fs::write(path, raw)?;
    Ok(())
}

pub fn upsert(app: &AppHandle, profile: ConnectionProfile) -> AppResult<Vec<ConnectionProfile>> {
    let mut profiles = load(app)?;
    if let Some(existing) = profiles.iter_mut().find(|p| p.id == profile.id) {
        *existing = profile;
    } else {
        profiles.push(profile);
    }
    persist(app, &profiles)?;
    Ok(profiles)
}

pub fn delete(app: &AppHandle, id: &str) -> AppResult<Vec<ConnectionProfile>> {
    let mut profiles = load(app)?;
    profiles.retain(|p| p.id != id);
    persist(app, &profiles)?;
    let _ = secrets::delete_secret(id, secrets::SecretKind::Password);
    let _ = secrets::delete_secret(id, secrets::SecretKind::Passphrase);
    Ok(profiles)
}

pub fn touch_last_connected(app: &AppHandle, id: &str, timestamp_ms: i64) -> AppResult<Vec<ConnectionProfile>> {
    let mut profiles = load(app)?;
    if let Some(existing) = profiles.iter_mut().find(|p| p.id == id) {
        existing.last_connected_at = Some(timestamp_ms);
    } else {
        return Err(AppError::NotFound(format!("connection profile {id}")));
    }
    persist(app, &profiles)?;
    Ok(profiles)
}


pub fn host_key_fingerprint_for(app: &AppHandle, id: &str) -> Option<String> {
    load(app)
        .ok()?
        .into_iter()
        .find(|p| p.id == id)
        .and_then(|p| p.host_key_fingerprint)
}

fn known_hosts_path(app: &AppHandle) -> AppResult<std::path::PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Other(e.to_string()))?;
    fs::create_dir_all(&dir)?;
    Ok(dir.join("known_hosts.json"))
}

fn load_known_hosts(app: &AppHandle) -> std::collections::HashMap<String, String> {
    let Ok(path) = known_hosts_path(app) else {
        return std::collections::HashMap::new();
    };
    fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

/// Trusted host-key fingerprint for a `host:port`, independent of saved
/// profiles — so ad-hoc (quick) connections are verified too, not just
/// profile connections.
pub fn known_host_fingerprint(app: &AppHandle, host_port: &str) -> Option<String> {
    load_known_hosts(app).remove(host_port)
}

pub fn set_known_host(app: &AppHandle, host_port: &str, fingerprint: &str) -> AppResult<()> {
    let mut hosts = load_known_hosts(app);
    hosts.insert(host_port.to_string(), fingerprint.to_string());
    let path = known_hosts_path(app)?;
    fs::write(path, serde_json::to_string_pretty(&hosts)?)?;
    Ok(())
}
