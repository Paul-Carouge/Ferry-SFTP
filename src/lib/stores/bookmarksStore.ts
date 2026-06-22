import { create } from "zustand";

export interface Bookmark {
  id: string;
  label: string;
  path: string;
  side: "local" | "remote";
}

const STORAGE_KEY = "ferry-bookmarks";

function load(): Bookmark[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Bookmark[]) : [];
  } catch {
    return [];
  }
}

function persist(bookmarks: Bookmark[]) {
  if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
}

interface BookmarksState {
  bookmarks: Bookmark[];
  init: () => void;
  add: (path: string, side: "local" | "remote", label?: string) => void;
  remove: (id: string) => void;
}

/** User-pinned folders for quick navigation, persisted to localStorage. */
export const useBookmarksStore = create<BookmarksState>((set, get) => ({
  bookmarks: [],

  init: () => set({ bookmarks: load() }),

  add: (path, side, label) => {
    const id = `${side}:${path}`;
    if (get().bookmarks.some((b) => b.id === id)) return;
    const name = label ?? path.split("/").filter(Boolean).pop() ?? path;
    const bookmarks = [...get().bookmarks, { id, label: name, path, side }];
    persist(bookmarks);
    set({ bookmarks });
  },

  remove: (id) => {
    const bookmarks = get().bookmarks.filter((b) => b.id !== id);
    persist(bookmarks);
    set({ bookmarks });
  },
}));
