use crate::error::{AppError, AppResult};
use keyring::Entry;

const SERVICE: &str = "com.ferry.app";

#[derive(Debug, Clone, Copy)]
pub enum SecretKind {
    Password,
    Passphrase,
}

impl SecretKind {
    fn account(self, profile_id: &str) -> String {
        match self {
            SecretKind::Password => format!("{profile_id}:password"),
            SecretKind::Passphrase => format!("{profile_id}:passphrase"),
        }
    }
}

fn entry(profile_id: &str, kind: SecretKind) -> AppResult<Entry> {
    Entry::new(SERVICE, &kind.account(profile_id)).map_err(AppError::from)
}

pub fn set_secret(profile_id: &str, kind: SecretKind, value: &str) -> AppResult<()> {
    entry(profile_id, kind)?.set_password(value)?;
    Ok(())
}

pub fn get_secret(profile_id: &str, kind: SecretKind) -> AppResult<Option<String>> {
    match entry(profile_id, kind)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(AppError::from(e)),
    }
}

pub fn delete_secret(profile_id: &str, kind: SecretKind) -> AppResult<()> {
    match entry(profile_id, kind)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(AppError::from(e)),
    }
}
