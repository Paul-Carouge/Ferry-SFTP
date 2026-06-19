"use client";

import { Modal } from "@/components/common/Modal";
import { useSettingsStore, type Locale } from "@/lib/stores/settingsStore";
import { useT } from "@/lib/i18n/useT";

const LOCALES: { value: Locale; label: string }[] = [
  { value: "en", label: "English" },
  { value: "fr", label: "Français" },
];

export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const locale = useSettingsStore((s) => s.locale);
  const setLocale = useSettingsStore((s) => s.setLocale);

  return (
    <Modal open={open} onClose={onClose} width="max-w-sm">
      <h2 className="text-sm font-semibold text-foreground">{t("settings.title")}</h2>

      <div className="mt-4">
        <span className="text-xs font-medium text-foreground-muted">{t("settings.language")}</span>
        <div className="mt-1.5 flex gap-1.5 rounded-lg bg-surface-2 p-1">
          {LOCALES.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setLocale(value)}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                locale === value
                  ? "bg-surface-1 text-foreground shadow-sm"
                  : "text-foreground-muted hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
