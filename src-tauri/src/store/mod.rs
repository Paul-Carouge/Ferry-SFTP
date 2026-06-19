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
