import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export interface UpdateInfo {
  version: string;
  body: string | null;
}

export interface AvailableUpdate {
  info: UpdateInfo;
  /** Downloads, installs, then relaunches the app. */
  install: () => Promise<void>;
}

/**
 * Checks the configured GitHub releases endpoint for a newer signed build.
 * Returns `null` when already up to date. The updater plugin's IPC is only
 * present in the Tauri runtime, so this throws in a plain browser/dev-server
 * context — callers should treat a thrown error as "couldn't check".
 */
export async function checkForUpdate(): Promise<AvailableUpdate | null> {
  const update = await check();
  if (!update) return null;
  return {
    info: { version: update.version, body: update.body ?? null },
    install: async () => {
      await update.downloadAndInstall();
      await relaunch();
    },
  };
}
