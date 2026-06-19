import { create } from "zustand";
import { onTransferUpdate, transfersApi, type TransferRecord } from "@/lib/api";
import { useToastStore } from "@/lib/stores/toastStore";
import { baseName } from "@/lib/path";

interface TransfersState {
  records: Record<string, TransferRecord>;
  initialized: boolean;
  init: () => Promise<void>;
  upsert: (record: TransferRecord) => void;
  clearCompleted: () => void;
}

export const useTransfersStore = create<TransfersState>((set, get) => ({
  records: {},
  initialized: false,

  init: async () => {
    if (get().initialized) return;
    set({ initialized: true });

    const existing = await transfersApi.list();
    set({
      records: Object.fromEntries(existing.map((r) => [r.id, r])),
    });

    await onTransferUpdate((record) => {
      get().upsert(record);
    });
  },

  upsert: (record) =>
    set((state) => {
      const prev = state.records[record.id];
      if (prev?.state !== record.state) {
        const name = baseName(record.direction === "upload" ? record.remotePath : record.localPath);
        const verb = record.direction === "upload" ? "Upload" : "Download";
        if (record.state === "completed") {
          useToastStore.getState().push(`${verb} complete: ${name}`, "success");
        } else if (record.state === "error") {
          useToastStore.getState().push(`${verb} failed: ${name}${record.error ? ` — ${record.error}` : ""}`, "error");
        }
      }
      return { records: { ...state.records, [record.id]: record } };
    }),

  clearCompleted: () =>
    set((state) => ({
      records: Object.fromEntries(
        Object.entries(state.records).filter(
          ([, r]) => r.state !== "completed" && r.state !== "cancelled",
        ),
      ),
    })),
}));
