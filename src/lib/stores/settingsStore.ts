import { create } from "zustand";

export type Locale = "en" | "fr";

const STORAGE_KEY = "ferry-locale";

function detectLocale(): Locale {
  if (typeof navigator === "undefined") return "en";
  return navigator.language.toLowerCase().startsWith("fr") ? "fr" : "en";
}

interface SettingsState {
  locale: Locale;
  init: () => void;
  setLocale: (locale: Locale) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  locale: "en",

  init: () => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(STORAGE_KEY);
    const locale: Locale = stored === "en" || stored === "fr" ? stored : detectLocale();
    document.documentElement.lang = locale;
    set({ locale });
  },

  setLocale: (locale) => {
    localStorage.setItem(STORAGE_KEY, locale);
    document.documentElement.lang = locale;
    set({ locale });
  },
}));
