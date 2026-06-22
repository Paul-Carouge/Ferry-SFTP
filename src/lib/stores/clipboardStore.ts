import { create } from "zustand";
import type { RemoteEntry } from "@/lib/api";

export type ClipboardMode = "copy" | "cut";

interface ClipboardState {
  items: RemoteEntry[];
  side: "local" | "remote" | null;
  connectionId: string | null;
  mode: ClipboardMode;
  set: (
    items: RemoteEntry[],
    side: "local" | "remote",
    connectionId: string | undefined,
    mode: ClipboardMode,
  ) => void;
  clear: () => void;
}

/** Cross-pane file clipboard for copy/cut → paste (move) within or across sides. */
export const useClipboardStore = create<ClipboardState>((set) => ({
  items: [],
  side: null,
  connectionId: null,
  mode: "copy",
  set: (items, side, connectionId, mode) =>
    set({ items, side, connectionId: connectionId ?? null, mode }),
  clear: () => set({ items: [], side: null, connectionId: null, mode: "copy" }),
}));
