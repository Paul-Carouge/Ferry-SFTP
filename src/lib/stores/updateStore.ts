import { create } from "zustand";
import { checkForUpdate, type AvailableUpdate, type UpdateInfo } from "@/lib/updater";

interface UpdateState {
  available: UpdateInfo | null;
  checking: boolean;
  installing: boolean;
  /** True after a manual check that found nothing, to show "up to date". */
  checkedClean: boolean;
  install: (() => Promise<void>) | null;
  /** Silent check (startup) — swallows errors, only surfaces if found. */
  checkSilently: () => Promise<void>;
  /** Manual check — sets checking/checkedClean so the UI can react. */
  checkNow: () => Promise<void>;
  installNow: () => Promise<void>;
}

function apply(set: (s: Partial<UpdateState>) => void, update: AvailableUpdate | null) {
  if (update) {
    set({ available: update.info, install: update.install, checkedClean: false });
  } else {
    set({ available: null, install: null });
  }
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  available: null,
  checking: false,
  installing: false,
  checkedClean: false,
  install: null,

  checkSilently: async () => {
    try {
      apply(set, await checkForUpdate());
    } catch {
      // No updater runtime (e.g. web dev) or network error — stay quiet.
    }
  },

  checkNow: async () => {
    set({ checking: true, checkedClean: false });
    try {
      const update = await checkForUpdate();
      apply(set, update);
      set({ checkedClean: update === null });
    } catch {
      set({ checkedClean: false });
    } finally {
      set({ checking: false });
    }
  },

  installNow: async () => {
    const install = get().install;
    if (!install) return;
    set({ installing: true });
    try {
      await install();
    } finally {
      set({ installing: false });
    }
  },
}));
