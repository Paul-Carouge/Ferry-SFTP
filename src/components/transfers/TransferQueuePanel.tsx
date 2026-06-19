"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  ChevronDown,
  ChevronUp,
  Pause,
  Play,
  Trash2,
  X,
} from "lucide-react";
import { useTransfersStore } from "@/lib/stores/transfersStore";
import { transfersApi, type TransferRecord } from "@/lib/api";
import { formatBytes, formatEta, formatSpeed } from "@/lib/format";
import { baseName } from "@/lib/path";
import { slideUpFromBottom } from "@/lib/animations";
import { useT, type TFunction } from "@/lib/i18n/useT";

const ACTIVE_STATES = new Set(["queued", "running", "paused"]);

export function TransferQueuePanel() {
  const t = useT();
  const records = useTransfersStore((s) => s.records);
  const clearCompleted = useTransfersStore((s) => s.clearCompleted);
  const [expanded, setExpanded] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const prevActiveCount = useRef(0);

  const list = useMemo(
    () => Object.values(records).sort((a, b) => a.createdAt - b.createdAt),
    [records],
  );
  const active = list.filter((r) => ACTIVE_STATES.has(r.state));
  const done = list.filter((r) => !ACTIVE_STATES.has(r.state));

  useEffect(() => {
    if (active.length > prevActiveCount.current) setExpanded(true);
    prevActiveCount.current = active.length;
  }, [active.length]);

  useEffect(() => {
    if (expanded && drawerRef.current) slideUpFromBottom(drawerRef.current);
  }, [expanded]);

  if (list.length === 0) return null;

  return (
    <div className="shrink-0 border-t border-border bg-surface-0">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-1.5 text-xs text-foreground-muted hover:text-foreground"
      >
        <span>
          {active.length > 0
            ? t("transfers.inProgress", { count: active.length, s: active.length > 1 ? "s" : "" })
            : t("transfers.total", { count: list.length, s: list.length > 1 ? "s" : "" })}
        </span>
        {expanded ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
      </button>

      {expanded && (
        <div ref={drawerRef} className="max-h-56 overflow-y-auto border-t border-border">
          {list.map((record) => (
            <TransferRow key={record.id} record={record} t={t} />
          ))}
          {done.length > 0 && (
            <div className="flex justify-end px-3 py-1.5">
              <button
                onClick={clearCompleted}
                className="flex items-center gap-1 text-xs text-foreground-muted hover:text-foreground"
              >
                <Trash2 className="size-3" /> {t("transfers.clearFinished")}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TransferRow({ record, t }: { record: TransferRecord; t: TFunction }) {
  const name = baseName(record.direction === "upload" ? record.remotePath : record.localPath);
  const percent = record.totalBytes > 0 ? Math.min(100, (record.bytesTransferred / record.totalBytes) * 100) : 0;
  const remaining = Math.max(0, record.totalBytes - record.bytesTransferred);

  return (
    <div className="flex items-center gap-3 border-b border-border px-3 py-2 last:border-b-0">
      {record.direction === "upload" ? (
        <ArrowUpToLine className="size-3.5 shrink-0 text-accent" />
      ) : (
        <ArrowDownToLine className="size-3.5 shrink-0 text-success" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs font-medium text-foreground">{name}</span>
          <span className="shrink-0 text-[11px] text-foreground-muted">
            {formatBytes(record.bytesTransferred)} / {formatBytes(record.totalBytes)}
          </span>
        </div>
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-2">
          <div
            className={`h-full rounded-full ${record.state === "error" ? "bg-danger" : "bg-accent"}`}
            style={{ width: `${percent}%` }}
          />
        </div>
        <div className="mt-0.5 flex items-center justify-between text-[11px] text-foreground-muted">
          <span>
            {record.state === "running" && formatSpeed(record.speedBps)}
            {record.state === "error" && <span className="text-danger">{record.error}</span>}
            {record.state === "paused" && t("transfers.paused")}
            {record.state === "queued" && t("transfers.queued")}
            {record.state === "completed" && t("transfers.done")}
            {record.state === "cancelled" && t("transfers.cancelled")}
          </span>
          {record.state === "running" && <span>{formatEta(remaining, record.speedBps)}</span>}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {record.state === "running" && (
          <IconButton title={t("transfers.pause")} onClick={() => transfersApi.pause(record.id)}>
            <Pause className="size-3.5" />
          </IconButton>
        )}
        {record.state === "paused" && (
          <IconButton title={t("transfers.resume")} onClick={() => transfersApi.resume(record.id)}>
            <Play className="size-3.5" />
          </IconButton>
        )}
        {ACTIVE_STATES.has(record.state) && (
          <IconButton title={t("transfers.cancel")} onClick={() => transfersApi.cancel(record.id)}>
            <X className="size-3.5" />
          </IconButton>
        )}
      </div>
    </div>
  );
}

function IconButton({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="rounded-md p-1 text-foreground-muted hover:bg-surface-2 hover:text-foreground"
    >
      {children}
    </button>
  );
}
