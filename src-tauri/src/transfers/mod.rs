pub mod commands;

use crate::error::{AppError, AppResult};
use crate::sftp::connection::SftpConnection;
use serde::Serialize;
use std::collections::{HashMap, HashSet, VecDeque};
use std::io::{Read, Write};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

use crate::sftp::manager::SftpManager;

const CHUNK_SIZE: usize = 256 * 1024;
const PROGRESS_INTERVAL: Duration = Duration::from_millis(150);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum TransferDirection {
    Upload,
    Download,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum TransferState {
    Queued,
    Running,
    Paused,
    Completed,
    Cancelled,
    Error,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferRecord {
    pub id: String,
    pub connection_id: String,
    pub direction: TransferDirection,
    pub local_path: String,
    pub remote_path: String,
    pub total_bytes: u64,
    pub bytes_transferred: u64,
    pub state: TransferState,
    pub error: Option<String>,
    pub speed_bps: u64,
    pub created_at: i64,
}

enum TransferOutcome {
    Completed,
    Cancelled,
}

struct TransferControl {
    paused: AtomicBool,
    cancelled: AtomicBool,
}

#[derive(Default)]
pub struct TransferManager {
    records: Mutex<HashMap<String, TransferRecord>>,
    controls: Mutex<HashMap<String, Arc<TransferControl>>>,
    queues: Mutex<HashMap<String, VecDeque<String>>>,
    active_workers: Mutex<HashSet<String>>,
}

impl TransferManager {
    pub fn list(&self) -> Vec<TransferRecord> {
        let mut records: Vec<TransferRecord> = self.records.lock().unwrap().values().cloned().collect();
        records.sort_by_key(|r| r.created_at);
        records
    }

    fn insert_record(&self, record: TransferRecord) {
        self.records.lock().unwrap().insert(record.id.clone(), record);
    }

    fn get_record(&self, id: &str) -> Option<TransferRecord> {
        self.records.lock().unwrap().get(id).cloned()
    }

    fn set_state(&self, id: &str, state: TransferState, error: Option<String>) -> Option<TransferRecord> {
        let mut records = self.records.lock().unwrap();
        let record = records.get_mut(id)?;
        record.state = state;
        record.error = error;
        if matches!(state, TransferState::Completed) {
            record.bytes_transferred = record.total_bytes;
        }
        Some(record.clone())
    }

    fn set_progress(&self, id: &str, bytes_transferred: u64, speed_bps: u64) -> Option<TransferRecord> {
        let mut records = self.records.lock().unwrap();
        let record = records.get_mut(id)?;
        record.bytes_transferred = bytes_transferred;
        record.speed_bps = speed_bps;
        Some(record.clone())
    }

    fn control_for(&self, id: &str) -> Option<Arc<TransferControl>> {
        self.controls.lock().unwrap().get(id).cloned()
    }

    fn enqueue(&self, record: TransferRecord) {
        let connection_id = record.connection_id.clone();
        let id = record.id.clone();
        self.insert_record(record);
        self.controls.lock().unwrap().insert(
            id.clone(),
            Arc::new(TransferControl {
                paused: AtomicBool::new(false),
                cancelled: AtomicBool::new(false),
            }),
        );
        self.queues
            .lock()
            .unwrap()
            .entry(connection_id)
            .or_default()
            .push_back(id);
    }

    fn pop_next(&self, connection_id: &str) -> Option<String> {
        self.queues
            .lock()
            .unwrap()
            .get_mut(connection_id)
            .and_then(|q| q.pop_front())
    }

    /// Returns true if a worker was already running for this connection.
    fn mark_worker_active(&self, connection_id: &str) -> bool {
        !self.active_workers.lock().unwrap().insert(connection_id.to_string())
    }

    fn clear_worker(&self, connection_id: &str) {
        self.active_workers.lock().unwrap().remove(connection_id);
    }

    pub fn pause(&self, id: &str) -> AppResult<Option<TransferRecord>> {
        let control = self
            .control_for(id)
            .ok_or_else(|| AppError::NotFound(format!("transfer {id}")))?;
        control.paused.store(true, Ordering::SeqCst);
        Ok(self.set_state_if_running(id, TransferState::Paused))
    }

    pub fn resume(&self, id: &str) -> AppResult<Option<TransferRecord>> {
        let control = self
            .control_for(id)
            .ok_or_else(|| AppError::NotFound(format!("transfer {id}")))?;
        control.paused.store(false, Ordering::SeqCst);
        Ok(self.set_state_if_paused(id, TransferState::Running))
    }

    pub fn cancel(&self, id: &str) -> AppResult<Option<TransferRecord>> {
        let control = self
            .control_for(id)
            .ok_or_else(|| AppError::NotFound(format!("transfer {id}")))?;
        control.cancelled.store(true, Ordering::SeqCst);
        control.paused.store(false, Ordering::SeqCst);
        Ok(self.set_state(id, TransferState::Cancelled, None))
    }

    fn set_state_if_running(&self, id: &str, state: TransferState) -> Option<TransferRecord> {
        let mut records = self.records.lock().unwrap();
        let record = records.get_mut(id)?;
        if matches!(record.state, TransferState::Running | TransferState::Queued) {
            record.state = state;
        }
        Some(record.clone())
    }

    fn set_state_if_paused(&self, id: &str, state: TransferState) -> Option<TransferRecord> {
        let mut records = self.records.lock().unwrap();
        let record = records.get_mut(id)?;
        if matches!(record.state, TransferState::Paused) {
            record.state = state;
        }
        Some(record.clone())
    }
}

fn emit_transfer(app: &AppHandle, record: &TransferRecord) {
    let _ = app.emit("transfer:update", record);
}

pub fn spawn_enqueue(
    app: AppHandle,
    connection_id: String,
    direction: TransferDirection,
    local_path: String,
    remote_path: String,
    total_bytes: u64,
    created_at: i64,
) -> String {
    let id = uuid::Uuid::new_v4().to_string();
    let record = TransferRecord {
        id: id.clone(),
        connection_id: connection_id.clone(),
        direction,
        local_path,
        remote_path,
        total_bytes,
        bytes_transferred: 0,
        state: TransferState::Queued,
        error: None,
        speed_bps: 0,
        created_at,
    };

    let tm = app.state::<TransferManager>();
    tm.enqueue(record.clone());
    emit_transfer(&app, &record);

    let already_running = tm.mark_worker_active(&connection_id);
    if !already_running {
        let app_for_worker = app.clone();
        tauri::async_runtime::spawn(async move {
            run_worker(app_for_worker, connection_id).await;
        });
    }

    id
}

async fn run_worker(app: AppHandle, connection_id: String) {
    loop {
        let next_id = {
            let tm = app.state::<TransferManager>();
            tm.pop_next(&connection_id)
        };
        let Some(transfer_id) = next_id else {
            app.state::<TransferManager>().clear_worker(&connection_id);
            break;
        };
        process_transfer(&app, &connection_id, &transfer_id).await;
    }
}

async fn process_transfer(app: &AppHandle, connection_id: &str, transfer_id: &str) {
    let tm = app.state::<TransferManager>();
    let Some(record) = tm.get_record(transfer_id) else {
        return;
    };
    let Some(control) = tm.control_for(transfer_id) else {
        return;
    };

    if control.cancelled.load(Ordering::SeqCst) {
        if let Some(r) = tm.set_state(transfer_id, TransferState::Cancelled, None) {
            emit_transfer(app, &r);
        }
        return;
    }

    if let Some(r) = tm.set_state(transfer_id, TransferState::Running, None) {
        emit_transfer(app, &r);
    }

    let conn = match app.state::<SftpManager>().get(connection_id) {
        Ok(conn) => conn,
        Err(e) => {
            if let Some(r) = tm.set_state(transfer_id, TransferState::Error, Some(e.to_string())) {
                emit_transfer(app, &r);
            }
            return;
        }
    };

    let app_for_blocking = app.clone();
    let transfer_id_owned = transfer_id.to_string();
    let direction = record.direction;
    let local_path = record.local_path.clone();
    let remote_path = record.remote_path.clone();

    let result = tauri::async_runtime::spawn_blocking(move || {
        copy_loop(
            &app_for_blocking,
            &transfer_id_owned,
            &conn,
            &control,
            direction,
            &local_path,
            &remote_path,
        )
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()));

    match result {
        Ok(Ok(TransferOutcome::Completed)) => {
            if let Some(r) = tm.set_state(transfer_id, TransferState::Completed, None) {
                emit_transfer(app, &r);
            }
        }
        Ok(Ok(TransferOutcome::Cancelled)) => {
            if let Some(r) = tm.set_state(transfer_id, TransferState::Cancelled, None) {
                emit_transfer(app, &r);
            }
        }
        Ok(Err(e)) | Err(e) => {
            if let Some(r) = tm.set_state(transfer_id, TransferState::Error, Some(e.to_string())) {
                emit_transfer(app, &r);
            }
        }
    }
}

fn open_src(
    conn: &SftpConnection,
    direction: TransferDirection,
    local_path: &str,
    remote_path: &str,
) -> AppResult<Box<dyn Read + Send>> {
    match direction {
        TransferDirection::Upload => Ok(Box::new(std::fs::File::open(local_path)?)),
        TransferDirection::Download => Ok(Box::new(conn.sftp().open(Path::new(remote_path))?)),
    }
}

fn open_dst(
    conn: &SftpConnection,
    direction: TransferDirection,
    local_path: &str,
    remote_path: &str,
) -> AppResult<Box<dyn Write + Send>> {
    match direction {
        TransferDirection::Upload => Ok(Box::new(conn.sftp().create(Path::new(remote_path))?)),
        TransferDirection::Download => {
            if let Some(parent) = Path::new(local_path).parent() {
                std::fs::create_dir_all(parent)?;
            }
            Ok(Box::new(std::fs::File::create(local_path)?))
        }
    }
}

fn copy_loop(
    app: &AppHandle,
    transfer_id: &str,
    conn: &SftpConnection,
    control: &Arc<TransferControl>,
    direction: TransferDirection,
    local_path: &str,
    remote_path: &str,
) -> AppResult<TransferOutcome> {
    let mut src = open_src(conn, direction, local_path, remote_path)?;
    let mut dst = open_dst(conn, direction, local_path, remote_path)?;

    let mut buf = vec![0u8; CHUNK_SIZE];
    let mut transferred: u64 = 0;
    let mut last_emit = Instant::now();
    let mut last_emit_bytes: u64 = 0;
    let tm = app.state::<TransferManager>();

    loop {
        if control.cancelled.load(Ordering::SeqCst) {
            drop(src);
            drop(dst);
            cleanup_partial(conn, direction, local_path, remote_path);
            return Ok(TransferOutcome::Cancelled);
        }

        if control.paused.load(Ordering::SeqCst) {
            std::thread::sleep(Duration::from_millis(100));
            continue;
        }

        let n = src.read(&mut buf)?;
        if n == 0 {
            break;
        }
        dst.write_all(&buf[..n])?;
        transferred += n as u64;

        let elapsed = last_emit.elapsed();
        if elapsed >= PROGRESS_INTERVAL {
            let speed = ((transferred - last_emit_bytes) as f64 / elapsed.as_secs_f64()) as u64;
            if let Some(r) = tm.set_progress(transfer_id, transferred, speed) {
                emit_transfer(app, &r);
            }
            last_emit = Instant::now();
            last_emit_bytes = transferred;
        }
    }

    if let Some(r) = tm.set_progress(transfer_id, transferred, 0) {
        emit_transfer(app, &r);
    }
    Ok(TransferOutcome::Completed)
}

fn cleanup_partial(conn: &SftpConnection, direction: TransferDirection, local_path: &str, remote_path: &str) {
    match direction {
        TransferDirection::Download => {
            let _ = std::fs::remove_file(local_path);
        }
        TransferDirection::Upload => {
            let _ = conn.remove_file(remote_path);
        }
    }
}
