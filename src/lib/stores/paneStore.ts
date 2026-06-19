import { create } from "zustand";
import type { RemoteEntry } from "@/lib/api";

export type PaneEntry = RemoteEntry;

interface PaneState {
  cwd: string;
  entries: PaneEntry[];
  loading: boolean;
  error: string | null;
  selected: Set<string>;
  filter: string;
  history: string[];
  setCwd: (cwd: string) => void;
  setEntries: (entries: PaneEntry[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  toggleSelected: (path: string, exclusive?: boolean) => void;
  clearSelection: () => void;
  setFilter: (filter: string) => void;
  pushHistory: (cwd: string) => void;
  popHistory: () => string | undefined;
}

export function createPaneStore(initialCwd: string) {
  return create<PaneState>((set, get) => ({
    cwd: initialCwd,
    entries: [],
    loading: false,
    error: null,
    selected: new Set(),
    filter: "",
    history: [],
    setCwd: (cwd) => set({ cwd }),
    setEntries: (entries) => set({ entries }),
    setLoading: (loading) => set({ loading }),
    setError: (error) => set({ error }),
    toggleSelected: (path, exclusive) =>
      set((state) => {
        if (exclusive) return { selected: new Set([path]) };
        const next = new Set(state.selected);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        return { selected: next };
      }),
    clearSelection: () => set({ selected: new Set() }),
    setFilter: (filter) => set({ filter }),
    pushHistory: (cwd) => set((state) => ({ history: [...state.history, cwd] })),
    popHistory: () => {
      const history = get().history;
      if (history.length === 0) return undefined;
      const last = history[history.length - 1];
      set({ history: history.slice(0, -1) });
      return last;
    },
  }));
}

export const useLocalPaneStore = createPaneStore("/");
