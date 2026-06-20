import { create } from "zustand";

export type Locale = "en" | "fr";

const STORAGE_KEY = "ferry-locale";
const HIDDEN_KEY = "ferry-show-hidden";
const TOASTS_KEY = "ferry-transfer-toasts";

function detectLocale(): Locale {
  if (typeof navigator === "undefined") return "en";
  return navigator.language.toLowerCase().startsWith("fr") ? "fr" : "en";
}

interface SettingsState {
  locale: Locale;
  showHiddenFiles: boolean;
  showTransferToasts: boolean;
  init: () => void;
  setLocale: (locale: Locale) => void;
  setShowHiddenFiles: (v: boolean) => void;
  setShowTransferToasts: (v: boolean) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  locale: "en",
  showHiddenFiles: false,
  showTransferToasts: true,

  init: () => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(STORAGE_KEY);
    const locale: Locale = stored === "en" || stored === "fr" ? stored : detectLocale();
    document.documentElement.lang = locale;
    const showHiddenFiles = localStorage.getItem(HIDDEN_KEY) === "true";
    const showTransferToasts = localStorage.getItem(TOASTS_KEY) !== "false";
    set({ locale, showHiddenFiles, showTransferToasts });
  },

  setLocale: (locale) => {
    localStorage.setItem(STORAGE_KEY, locale);
    document.documentElement.lang = locale;
    set({ locale });
  },

  setShowHiddenFiles: (v) => {
    localStorage.setItem(HIDDEN_KEY, String(v));
    set({ showHiddenFiles: v });
  },

  setShowTransferToasts: (v) => {
    localStorage.setItem(TOASTS_KEY, String(v));
    set({ showTransferToasts: v });
  },
}));
