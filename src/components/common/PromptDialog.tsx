"use client";

import { useState } from "react";
import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/common/Button";
import { useT } from "@/lib/i18n/useT";

export function PromptDialog({
  open,
  title,
  label,
  initialValue = "",
  confirmLabel,
  onSubmit,
  onCancel,
}: {
  open: boolean;
  title: string;
  label: string;
  initialValue?: string;
  confirmLabel?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const [value, setValue] = useState(initialValue);
  const [prevOpen, setPrevOpen] = useState(open);

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setValue(initialValue);
  }

  return (
    <Modal open={open} onClose={onCancel} width="max-w-sm">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <label className="mt-3 flex flex-col gap-1">
        <span className="text-xs font-medium text-foreground-muted">{label}</span>
        <input
          autoFocus
          className="w-full rounded-lg border border-border bg-surface-0 px-3 py-1.5 text-sm text-foreground outline-none focus:border-accent"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && value.trim()) onSubmit(value.trim());
          }}
        />
      </label>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button variant="primary" disabled={!value.trim()} onClick={() => onSubmit(value.trim())}>
          {confirmLabel ?? t("common.save")}
        </Button>
      </div>
    </Modal>
  );
}
