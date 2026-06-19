import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type AuthMethod = "password" | "key";

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
  listDir: (path: string) => invoke<RemoteEntry[]>("local_list_dir", { path }),
  search: (path: string, query: string) => invoke<RemoteEntry[]>("local_search", { path, query }),
  stat: (path: string) => invoke<RemoteEntry>("local_stat", { path }),
  mkdir: (path: string) => invoke<void>("local_mkdir", { path }),
  remove: (path: string, isDir: boolean) => invoke<void>("local_remove", { path, isDir }),
  rename: (from: string, to: string) => invoke<void>("local_rename", { from, to }),
  readPreview: async (path: string): Promise<Uint8Array> => {
    const bytes = await invoke<number[]>("local_read_preview", { path });
    return new Uint8Array(bytes);
  },
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
}

export interface ConnectResult {
  connectionId: string;
  homeDir: string;
}

export const sftpApi = {
  connect: (input: ConnectInput) => invoke<ConnectResult>("sftp_connect", { input }),
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
  chmod: (connectionId: string, path: string, mode: number) =>
    invoke<void>("sftp_chmod", { connectionId, path, mode }),
  readPreview: async (connectionId: string, path: string): Promise<Uint8Array> => {
    const bytes = await invoke<number[]>("sftp_read_preview", { connectionId, path });
    return new Uint8Array(bytes);
  },
};

// --- Transfer queue ---

export const transfersApi = {
  enqueueUpload: (connectionId: string, localPath: string, remotePath: string) =>
    invoke<string>("transfer_enqueue_upload", { connectionId, localPath, remotePath }),
  enqueueDownload: (connectionId: string, remotePath: string, localPath: string) =>
    invoke<string>("transfer_enqueue_download", { connectionId, remotePath, localPath }),
  pause: (id: string) => invoke<void>("transfer_pause", { id }),
  resume: (id: string) => invoke<void>("transfer_resume", { id }),
  cancel: (id: string) => invoke<void>("transfer_cancel", { id }),
  list: () => invoke<TransferRecord[]>("transfer_list"),
};

// --- Events ---

export function onTransferUpdate(callback: (record: TransferRecord) => void) {
  return listen<TransferRecord>("transfer:update", (event) => callback(event.payload));
}

export function onConnectionStatus(callback: (payload: ConnectionStatusPayload) => void) {
  return listen<ConnectionStatusPayload>("connection:status", (event) => callback(event.payload));
}
