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
  const showHiddenFiles = useSettingsStore((s) => s.showHiddenFiles);
  const setShowHiddenFiles = useSettingsStore((s) => s.setShowHiddenFiles);
  const showTransferToasts = useSettingsStore((s) => s.showTransferToasts);
  const setShowTransferToasts = useSettingsStore((s) => s.setShowTransferToasts);

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

      <div className="mt-5 border-t border-border pt-4">
        <span className="text-xs font-medium text-foreground-muted">{t("settings.fileBrowser")}</span>
        <div className="mt-2 space-y-2">
          <ToggleRow
            label={t("settings.showHiddenFiles")}
            description={t("settings.showHiddenFilesDesc")}
            value={showHiddenFiles}
            onChange={setShowHiddenFiles}
          />
        </div>
      </div>

      <div className="mt-5 border-t border-border pt-4">
        <span className="text-xs font-medium text-foreground-muted">{t("settings.transfers")}</span>
        <div className="mt-2 space-y-2">
          <ToggleRow
            label={t("settings.transferToasts")}
            description={t("settings.transferToastsDesc")}
            value={showTransferToasts}
            onChange={setShowTransferToasts}
          />
        </div>
      </div>

      <UpdateSection />
    </Modal>
  );
}

function ToggleRow({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm text-foreground">{label}</p>
        {description && <p className="text-xs text-foreground-muted">{description}</p>}
      </div>
      <button
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
          value ? "bg-accent" : "bg-surface-2"
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
            value ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
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
