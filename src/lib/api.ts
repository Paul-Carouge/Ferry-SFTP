import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type AuthMethod = "password" | "key" | "agent";

export interface ConnectionProfile {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authMethod: AuthMethod;
  keyPath: string | null;
  defaultRemotePath: string | null;
  color: string | null;
  favorite: boolean;
  createdAt: number;
  lastConnectedAt: number | null;
}

export interface SaveConnectionInput {
  id?: string | null;
  name: string;
  host: string;
  port: number;
  username: string;
  authMethod: AuthMethod;
  keyPath?: string | null;
  defaultRemotePath?: string | null;
  color?: string | null;
  favorite: boolean;
  secret?: string | null;
}

export interface RemoteEntry {
  name: string;
  path: string;
  isDir: boolean;
  isSymlink: boolean;
  size: number;
  modified: number | null;
  permissions: number | null;
  symlinkTarget: string | null;
}

export type ConnectionStatusState = "connecting" | "connected" | "error" | "disconnected";

export interface ConnectionStatusPayload {
  connectionId: string;
  state: ConnectionStatusState;
  message: string | null;
}

export type TransferDirection = "upload" | "download";
export type TransferState = "queued" | "running" | "paused" | "completed" | "cancelled" | "error";

export interface TransferRecord {
  id: string;
  connectionId: string;
  direction: TransferDirection;
  localPath: string;
  remotePath: string;
  totalBytes: number;
  bytesTransferred: number;
  state: TransferState;
  error: string | null;
  speedBps: number;
  createdAt: number;
  jobId: string | null;
}

export interface TransferJob {
  id: string;
  connectionId: string;
  direction: TransferDirection;
  rootLocalPath: string;
  rootRemotePath: string;
  totalFiles: number;
  totalBytes: number;
  createdAt: number;
}

export interface TransferPlanItem {
  localPath: string;
  remotePath: string;
  size: number;
  isDir: boolean;
}

// --- Connection profile store ---

export const connectionsApi = {
  list: () => invoke<ConnectionProfile[]>("list_connections"),
  save: (input: SaveConnectionInput) => invoke<ConnectionProfile[]>("save_connection", { input }),
  delete: (id: string) => invoke<ConnectionProfile[]>("delete_connection", { id }),
  getSecret: (id: string, authMethod: AuthMethod) =>
    invoke<string | null>("get_connection_secret", { id, authMethod }),
  touch: (id: string) => invoke<ConnectionProfile[]>("touch_connection", { id }),
};

// --- Local filesystem ---

export const localFsApi = {
  homeDir: () => invoke<string>("local_home_dir"),
  listSshKeys: () => invoke<string[]>("list_ssh_keys"),
  sshAgentAvailable: () => invoke<boolean>("ssh_agent_available"),
  listDir: (path: string) => invoke<RemoteEntry[]>("local_list_dir", { path }),
  search: (path: string, query: string) => invoke<RemoteEntry[]>("local_search", { path, query }),
  stat: (path: string) => invoke<RemoteEntry>("local_stat", { path }),
  mkdir: (path: string) => invoke<void>("local_mkdir", { path }),
  remove: (path: string, isDir: boolean) => invoke<void>("local_remove", { path, isDir }),
  rename: (from: string, to: string) => invoke<void>("local_rename", { from, to }),
  chmod: (path: string, mode: number) => invoke<void>("local_chmod", { path, mode }),
  copy: (from: string, to: string) => invoke<void>("local_copy", { from, to }),
  readPreview: async (path: string): Promise<Uint8Array> => {
    const bytes = await invoke<number[]>("local_read_preview", { path });
    return new Uint8Array(bytes);
  },
  writeFile: (path: string, content: number[]) =>
    invoke<void>("local_write_file", { path, content }),
  reveal: (path: string) => invoke<void>("local_reveal", { path }),
  openTerminal: (path: string) => invoke<void>("local_open_terminal", { path }),
  open: (path: string) => invoke<void>("local_open", { path }),
};

// --- SFTP session + filesystem ---

export interface ConnectInput {
  host: string;
  port: number;
  username: string;
  authMethod: AuthMethod;
  password?: string | null;
  keyPath?: string | null;
  passphrase?: string | null;
  /** Saved-profile id, enabling host-key TOFU persistence. */
  profileId?: string | null;
  /** Set true after the user accepts a first-time host-key trust prompt. */
  trustHostKey?: boolean;
}

export type ConnectOutcome =
  | { kind: "connected"; connectionId: string; homeDir: string }
  | { kind: "hostKeyPrompt"; fingerprint: string };

export const sftpApi = {
  connect: (input: ConnectInput) => invoke<ConnectOutcome>("sftp_connect", { input }),
  disconnect: (connectionId: string) => invoke<void>("sftp_disconnect", { connectionId }),
  listDir: (connectionId: string, path: string) =>
    invoke<RemoteEntry[]>("sftp_list_dir", { connectionId, path }),
  search: (connectionId: string, path: string, query: string) =>
    invoke<RemoteEntry[]>("sftp_search", { connectionId, path, query }),
  stat: (connectionId: string, path: string) =>
    invoke<RemoteEntry>("sftp_stat", { connectionId, path }),
  mkdir: (connectionId: string, path: string) =>
    invoke<void>("sftp_mkdir", { connectionId, path }),
  remove: (connectionId: string, path: string, isDir: boolean) =>
    invoke<void>("sftp_remove", { connectionId, path, isDir }),
  rename: (connectionId: string, from: string, to: string) =>
    invoke<void>("sftp_rename", { connectionId, from, to }),
  copy: (connectionId: string, from: string, to: string) =>
    invoke<void>("sftp_copy", { connectionId, from, to }),
  /** Stages remote paths to a temp dir; returns local paths for native drag-out. */
  stageTemp: (connectionId: string, paths: string[]) =>
    invoke<string[]>("sftp_stage_temp", { connectionId, paths }),
  chmod: (connectionId: string, path: string, mode: number) =>
    invoke<void>("sftp_chmod", { connectionId, path, mode }),
  readPreview: async (connectionId: string, path: string): Promise<Uint8Array> => {
    const bytes = await invoke<number[]>("sftp_read_preview", { connectionId, path });
    return new Uint8Array(bytes);
  },
  writeFile: (connectionId: string, path: string, content: number[]) =>
    invoke<void>("sftp_write_file", { connectionId, path, content }),
};

// --- Transfer queue ---

export const transfersApi = {
  enqueueUpload: (connectionId: string, localPath: string, remotePath: string) =>
    invoke<string>("transfer_enqueue_upload", { connectionId, localPath, remotePath }),
  enqueueDownload: (connectionId: string, remotePath: string, localPath: string) =>
    invoke<string>("transfer_enqueue_download", { connectionId, remotePath, localPath }),
  planFolder: (connectionId: string, direction: TransferDirection, localRoot: string, remoteRoot: string) =>
    invoke<TransferPlanItem[]>("transfer_plan_folder", {
      connectionId,
      direction,
      localRoot,
      remoteRoot,
    }),
  checkConflicts: (connectionId: string, direction: TransferDirection, items: TransferPlanItem[]) =>
    invoke<string[]>("transfer_check_conflicts", { connectionId, direction, items }),
  enqueueResolved: (connectionId: string, direction: TransferDirection, items: TransferPlanItem[]) =>
    invoke<string>("transfer_enqueue_resolved", { connectionId, direction, items }),
  pause: (id: string) => invoke<void>("transfer_pause", { id }),
  resume: (id: string) => invoke<void>("transfer_resume", { id }),
  cancel: (id: string) => invoke<void>("transfer_cancel", { id }),
  retry: (id: string) => invoke<void>("transfer_retry", { id }),
  list: () => invoke<TransferRecord[]>("transfer_list"),
  jobList: () => invoke<TransferJob[]>("transfer_job_list"),
  cancelJob: (jobId: string) => invoke<void>("transfer_cancel_job", { jobId }),
};

// --- External edit (edit-in-app with live re-upload) ---

export interface EditSession {
  id: string;
  name: string;
  remotePath: string;
}

export interface EditSyncEvent {
  id: string;
  name: string;
  remotePath: string;
  ok: boolean;
  error: string | null;
  at: number;
}

export const editApi = {
  start: (connectionId: string, remotePath: string) =>
    invoke<EditSession>("external_edit_start", { connectionId, remotePath }),
  stop: (id: string) => invoke<void>("external_edit_stop", { id }),
};

export function onExternalEditSync(callback: (event: EditSyncEvent) => void) {
  return listen<EditSyncEvent>("external-edit:sync", (event) => callback(event.payload));
}

// --- Events ---

export function onTransferUpdate(callback: (record: TransferRecord) => void) {
  return listen<TransferRecord>("transfer:update", (event) => callback(event.payload));
}

export function onConnectionStatus(callback: (payload: ConnectionStatusPayload) => void) {
  return listen<ConnectionStatusPayload>("connection:status", (event) => callback(event.payload));
}
