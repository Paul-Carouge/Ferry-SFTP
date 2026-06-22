import { useCallback } from "react";
import { useSettingsStore } from "@/lib/stores/settingsStore";
import { translations, type TranslationKey } from "@/lib/i18n/translations";

export type TFunction = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/** Non-hook translator for use outside React (stores, event handlers). */
export function translate(key: TranslationKey, vars?: Record<string, string | number>): string {
  const locale = useSettingsStore.getState().locale;
  const template = translations[locale][key] ?? key;
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, name) => String(vars[name] ?? ""));
}

export function useT(): TFunction {
  const locale = useSettingsStore((s) => s.locale);
  return useCallback<TFunction>(
    (key, vars) => {
      const template = translations[locale][key] ?? key;
      if (!vars) return template;
      return template.replace(/\{\{(\w+)\}\}/g, (_, name) => String(vars[name] ?? ""));
    },
    [locale],
  );
}
