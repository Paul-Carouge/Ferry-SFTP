mod error;
mod localfs;
mod sftp;
mod store;
mod transfers;

use sftp::manager::SftpManager;
use transfers::TransferManager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init())
    .manage(SftpManager::default())
    .manage(TransferManager::default())
    .invoke_handler(tauri::generate_handler![
      store::commands::list_connections,
      store::commands::save_connection,
      store::commands::delete_connection,
      store::commands::get_connection_secret,
      store::commands::touch_connection,
      localfs::commands::local_home_dir,
      localfs::commands::local_list_dir,
      localfs::commands::local_search,
      localfs::commands::local_stat,
      localfs::commands::local_mkdir,
      localfs::commands::local_remove,
      localfs::commands::local_rename,
      localfs::commands::local_read_preview,
      localfs::commands::local_write_file,
      sftp::commands::sftp_connect,
      sftp::commands::sftp_disconnect,
      sftp::commands::sftp_list_dir,
      sftp::commands::sftp_search,
      sftp::commands::sftp_stat,
      sftp::commands::sftp_mkdir,
      sftp::commands::sftp_remove,
      sftp::commands::sftp_rename,
      sftp::commands::sftp_chmod,
      sftp::commands::sftp_read_preview,
      sftp::commands::sftp_write_file,
      transfers::commands::transfer_enqueue_upload,
      transfers::commands::transfer_enqueue_download,
      transfers::commands::transfer_plan_folder,
      transfers::commands::transfer_check_conflicts,
      transfers::commands::transfer_enqueue_resolved,
      transfers::commands::transfer_pause,
      transfers::commands::transfer_resume,
      transfers::commands::transfer_cancel,
      transfers::commands::transfer_list,
      transfers::commands::transfer_job_list,
      transfers::commands::transfer_cancel_job,
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
