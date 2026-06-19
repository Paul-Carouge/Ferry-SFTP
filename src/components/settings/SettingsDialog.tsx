"use client";

import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/common/Button";
import { useSettingsStore, type Locale } from "@/lib/stores/settingsStore";
import { useUpdateStore } from "@/lib/stores/updateStore";
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

      <UpdateSection />
    </Modal>
  );
}

function UpdateSection() {
  const t = useT();
  const available = useUpdateStore((s) => s.available);
  const checking = useUpdateStore((s) => s.checking);
  const installing = useUpdateStore((s) => s.installing);
  const checkedClean = useUpdateStore((s) => s.checkedClean);
  const checkNow = useUpdateStore((s) => s.checkNow);
  const installNow = useUpdateStore((s) => s.installNow);

  return (
    <div className="mt-5 border-t border-border pt-4">
      <span className="text-xs font-medium text-foreground-muted">{t("settings.updates")}</span>

      {available ? (
        <div className="mt-1.5 rounded-lg border border-accent/40 bg-accent/10 p-3">
          <p className="text-sm font-semibold text-foreground">
            {t("update.available", { version: available.version })}
          </p>
          {available.body && (
            <p className="mt-1 max-h-28 overflow-y-auto whitespace-pre-wrap text-xs text-foreground-muted">
              {available.body}
            </p>
          )}
          <Button
            variant="primary"
            className="mt-3 w-full"
            disabled={installing}
            onClick={() => void installNow()}
          >
            {installing ? t("update.installing") : t("update.install")}
          </Button>
        </div>
      ) : (
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className="text-sm text-foreground-muted">
            {checking
              ? t("update.checking")
              : checkedClean
                ? t("update.upToDate")
                : ""}
          </span>
          <Button variant="secondary" disabled={checking} onClick={() => void checkNow()}>
            {t("update.checkNow")}
          </Button>
        </div>
      )}
    </div>
  );
}
