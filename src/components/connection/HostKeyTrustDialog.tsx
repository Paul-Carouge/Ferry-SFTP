"use client";

import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/common/Button";
import { useConnectionsStore } from "@/lib/stores/connectionsStore";
import { useT } from "@/lib/i18n/useT";

/** First-time host-key (TOFU) trust prompt, driven by the global
 * `pendingHostKey` store state so both the connection dialog and the sidebar
 * "Connect" action share one flow. */
export function HostKeyTrustDialog() {
  const t = useT();
  const pending = useConnectionsStore((s) => s.pendingHostKey);
  const confirm = useConnectionsStore((s) => s.confirmHostKey);
  const cancel = useConnectionsStore((s) => s.cancelHostKey);

  if (!pending) return null;

  return (
    <Modal open onClose={cancel} width="max-w-md">
      <h2 className="text-sm font-semibold text-foreground">{t("hostKey.trustTitle")}</h2>
      <p className="mt-2 text-sm text-foreground-muted">
        {t("hostKey.trustDesc", { host: pending.profile.host })}
      </p>
      <div className="mt-3">
        <span className="text-xs font-medium text-foreground-muted">{t("hostKey.fingerprint")}</span>
        <p className="mt-1 break-all rounded-lg bg-surface-2 px-3 py-2 font-mono text-xs text-foreground">
          SHA256:{pending.fingerprint}
        </p>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={cancel}>
          {t("hostKey.cancel")}
        </Button>
        <Button variant="primary" onClick={() => void confirm()}>
          {t("hostKey.trust")}
        </Button>
      </div>
    </Modal>
  );
}
