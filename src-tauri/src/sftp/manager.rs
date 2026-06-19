use super::connection::SftpConnection;
use crate::error::{AppError, AppResult};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

#[derive(Default)]
pub struct SftpManager(Mutex<HashMap<String, Arc<SftpConnection>>>);

impl SftpManager {
    pub fn insert(&self, connection_id: String, conn: SftpConnection) {
        self.0.lock().unwrap().insert(connection_id, Arc::new(conn));
    }

    pub fn get(&self, connection_id: &str) -> AppResult<Arc<SftpConnection>> {
        self.0
            .lock()
            .unwrap()
            .get(connection_id)
            .cloned()
            .ok_or_else(|| AppError::NotFound(format!("connection {connection_id}")))
    }

    pub fn remove(&self, connection_id: &str) -> Option<Arc<SftpConnection>> {
        self.0.lock().unwrap().remove(connection_id)
    }
}
