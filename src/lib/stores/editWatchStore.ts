import { create } from "zustand";
import { editApi, onExternalEditSync, type EditSession } from "@/lib/api";
import { useToastStore } from "@/lib/stores/toastStore";
import { translate } from "@/lib/i18n/useT";

interface Watch extends EditSession {
  connectionId: string;
}

const key = (connectionId: string, remotePath: string) => `${connectionId}:${remotePath}`;

interface EditWatchState {
  /** Active external-edit sessions, keyed by `${connectionId}:${remotePath}`. */
  watches: Record<string, Watch>;
  initialized: boolean;
  init: () => Promise<void>;
  isWatched: (connectionId: string, remotePath: string) => boolean;
  start: (connectionId: string, remotePath: string) => Promise<void>;
  stop: (connectionId: string, remotePath: string) => Promise<void>;
  stopForConnection: (connectionId: string) => void;
}

export const useEditWatchStore = create<EditWatchState>((set, get) => ({
  watches: {},
  initialized: false,

  init: async () => {
    if (get().initialized) return;
    set({ initialized: true });
    await onExternalEditSync((e) => {
      if (e.ok) {
        useToastStore.getState().push(translate("toast.editSynced", { name: e.name }), "success");
      } else {
        useToastStore
          .getState()
          .push(translate("toast.editSyncFailed", { name: e.name, error: e.error ?? "" }), "error");
      }
    });
  },

  isWatched: (connectionId, remotePath) => key(connectionId, remotePath) in get().watches,

  start: async (connectionId, remotePath) => {
    if (get().isWatched(connectionId, remotePath)) return;
    try {
      const session = await editApi.start(connectionId, remotePath);
      set((s) => ({ watches: { ...s.watches, [key(connectionId, remotePath)]: { ...session, connectionId } } }));
      useToastStore.getState().push(translate("toast.editOpened", { name: session.name }), "success");
    } catch (err) {
      useToastStore.getState().push(translate("toast.editFailed", { error: String(err) }), "error");
    }
  },

  stop: async (connectionId, remotePath) => {
    const k = key(connectionId, remotePath);
    const watch = get().watches[k];
    if (!watch) return;
    set((s) => {
      const next = { ...s.watches };
      delete next[k];
      return { watches: next };
    });
    try {
      await editApi.stop(watch.id);
      useToastStore.getState().push(translate("toast.editStopped", { name: watch.name }), "info");
    } catch {
      // best-effort; the backend also tears watches down on disconnect
    }
  },

  stopForConnection: (connectionId) => {
    const remaining: Record<string, Watch> = {};
    for (const [k, w] of Object.entries(get().watches)) {
      if (w.connectionId === connectionId) void editApi.stop(w.id).catch(() => {});
      else remaining[k] = w;
    }
    set({ watches: remaining });
  },
}));
