"use client";

import { Fragment, useState } from "react";
import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/common/Button";
import { useT } from "@/lib/i18n/useT";
import type { RemoteEntry } from "@/lib/api";

const CLASSES = ["owner", "group", "other"] as const;
const BITS = [
  { label: "r", value: 4 },
  { label: "w", value: 2 },
  { label: "x", value: 1 },
] as const;

/** Permissions (chmod) editor: rwx checkbox grid kept in sync with an octal field. */
export function PermissionsDialog({
  open,
  entry,
  onApply,
  onCancel,
}: {
  open: boolean;
  entry: RemoteEntry | null;
  onApply: (mode: number) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const initial = (entry?.permissions ?? 0o644) & 0o777;
  const [mode, setMode] = useState(initial);
  const [prevOpen, setPrevOpen] = useState(open);

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setMode((entry?.permissions ?? 0o644) & 0o777);
  }

  function toggle(classIdx: number, bit: number) {
    const shift = (2 - classIdx) * 3;
    setMode((m) => m ^ (bit << shift));
  }

  const octal = mode.toString(8).padStart(3, "0");

  return (
    <Modal open={open} onClose={onCancel} width="max-w-sm">
      <h2 className="text-sm font-semibold text-foreground">
        {t("perms.title", { name: entry?.name ?? "" })}
      </h2>

      <div className="mt-4 grid grid-cols-[auto_1fr_1fr_1fr] items-center gap-x-4 gap-y-2">
        <span />
        {BITS.map((b) => (
          <span key={b.label} className="text-center text-xs font-medium text-foreground-muted">
            {t(`perms.${b.label === "r" ? "read" : b.label === "w" ? "write" : "exec"}`)}
          </span>
        ))}
        {CLASSES.map((cls, classIdx) => (
          <Fragment key={cls}>
            <span className="text-xs font-medium text-foreground-muted">{t(`perms.${cls}`)}</span>
            {BITS.map((b) => {
              const shift = (2 - classIdx) * 3;
              const on = (mode & (b.value << shift)) !== 0;
              return (
                <label key={b.label} className="flex justify-center">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggle(classIdx, b.value)}
                    className="size-4 accent-accent"
                  />
                </label>
              );
            })}
          </Fragment>
        ))}
      </div>

      <label className="mt-4 flex items-center gap-2">
        <span className="text-xs font-medium text-foreground-muted">{t("perms.octal")}</span>
        <input
          value={octal}
          onChange={(e) => {
            const v = e.target.value.replace(/[^0-7]/g, "").slice(0, 3);
            if (v) setMode(parseInt(v.padStart(3, "0"), 8) & 0o777);
            else setMode(0);
          }}
          className="w-20 rounded-lg border border-border bg-surface-0 px-3 py-1.5 font-mono text-sm text-foreground outline-none focus:border-accent"
        />
      </label>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button variant="primary" onClick={() => onApply(mode)}>
          {t("common.apply")}
        </Button>
      </div>
    </Modal>
  );
}
