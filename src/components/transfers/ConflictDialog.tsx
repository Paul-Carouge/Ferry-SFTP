"use client";

import { useState } from "react";
import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/common/Button";
import { useT } from "@/lib/i18n/useT";
import type { ConflictChoice } from "@/lib/transferResolve";

export function ConflictDialog({
  open,
  path,
  onResolve,
}: {
  open: boolean;
  path: string;
  onResolve: (choice: ConflictChoice) => void;
}) {
  const t = useT();
  const [applyToAll, setApplyToAll] = useState(false);

  return (
    <Modal open={open} onClose={() => onResolve({ resolution: "skip", applyToAll })} width="max-w-sm">
      <h2 className="text-sm font-semibold text-foreground">{t("conflict.title")}</h2>
      <p className="mt-2 break-all font-mono text-xs text-foreground-muted">{path}</p>
      <p className="mt-2 text-sm text-foreground-muted">{t("conflict.fileExists")}</p>
      <label className="mt-3 flex items-center gap-2 text-sm text-foreground-muted">
        <input
          type="checkbox"
          checked={applyToAll}
          onChange={(e) => setApplyToAll(e.target.checked)}
        />
        {t("conflict.applyToAll")}
      </label>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={() => onResolve({ resolution: "skip", applyToAll })}>
          {t("conflict.skip")}
        </Button>
        <Button variant="secondary" onClick={() => onResolve({ resolution: "rename", applyToAll })}>
          {t("conflict.rename")}
        </Button>
        <Button variant="danger" onClick={() => onResolve({ resolution: "overwrite", applyToAll })}>
          {t("conflict.overwrite")}
        </Button>
      </div>
    </Modal>
  );
}
