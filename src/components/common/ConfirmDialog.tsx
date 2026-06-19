import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/common/Button";
import { useT } from "@/lib/i18n/useT";

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  danger = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  return (
    <Modal open={open} onClose={onCancel} width="max-w-sm">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {description && <p className="mt-2 text-sm text-foreground-muted">{description}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button variant={danger ? "danger" : "primary"} onClick={onConfirm}>
          {confirmLabel ?? t("common.confirm")}
        </Button>
      </div>
    </Modal>
  );
}
