import { create } from "zustand";

const THEME_KEY = "ferry-theme";

interface UiState {
  /** Cmd/Ctrl+K command palette. */
  paletteOpen: boolean;
  settingsOpen: boolean;
  newConnectionOpen: boolean;
  isDark: boolean;
  init: () => void;
  setPaletteOpen: (v: boolean) => void;
  togglePalette: () => void;
  setSettingsOpen: (v: boolean) => void;
  setNewConnectionOpen: (v: boolean) => void;
  toggleTheme: () => void;
  setTheme: (dark: boolean) => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  paletteOpen: false,
  settingsOpen: false,
  newConnectionOpen: false,
  isDark: false,

  init: () => {
    if (typeof document === "undefined") return;
    // Theme class is applied pre-hydration by the inline script in layout.tsx.
    set({ isDark: document.documentElement.classList.contains("dark") });
  },

  setPaletteOpen: (v) => set({ paletteOpen: v }),
  togglePalette: () => set((s) => ({ paletteOpen: !s.paletteOpen })),
  setSettingsOpen: (v) => set({ settingsOpen: v }),
  setNewConnectionOpen: (v) => set({ newConnectionOpen: v }),

  toggleTheme: () => get().setTheme(!get().isDark),
  setTheme: (dark) => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
    set({ isDark: dark });
  },
}));
