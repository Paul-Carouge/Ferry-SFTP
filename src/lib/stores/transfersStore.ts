import { create } from "zustand";
import { onTransferUpdate, transfersApi, type TransferRecord } from "@/lib/api";

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
    set((state) => ({ records: { ...state.records, [record.id]: record } })),

  clearCompleted: () =>
    set((state) => ({
      records: Object.fromEntries(
        Object.entries(state.records).filter(
          ([, r]) => r.state !== "completed" && r.state !== "cancelled",
        ),
      ),
    })),
}));
