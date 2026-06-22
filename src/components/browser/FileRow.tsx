import type { DragEvent, MouseEvent } from "react";
import { FileIcon } from "@/components/common/FileIcon";
import { formatBytes, formatDate, permissionsToString } from "@/lib/format";
import type { RemoteEntry } from "@/lib/api";

export type CompareStatus = "onlyHere" | "newer" | "older" | "differ" | "same";

const COMPARE_STYLE: Record<CompareStatus, { dot: string; title: string }> = {
  onlyHere: { dot: "bg-sky-500", title: "Only here" },
  newer: { dot: "bg-emerald-500", title: "Newer than other side" },
  older: { dot: "bg-amber-500", title: "Older than other side" },
  differ: { dot: "bg-violet-500", title: "Differs (same time, different size)" },
  same: { dot: "bg-transparent", title: "Identical" },
};

export function FileRow({
  entry,
  selected,
  isActive,
  subPath,
  isDropTarget,
  compareStatus,
  onClick,
  onDoubleClick,
  onContextMenu,
  onDragStart,
  onDrop,
  onDragOver,
  onDragLeave,
}: {
  entry: RemoteEntry;
  selected: boolean;
  isActive?: boolean;
  subPath?: string;
  isDropTarget?: boolean;
  compareStatus?: CompareStatus;
  onClick: (e: MouseEvent) => void;
  onDoubleClick: () => void;
  onContextMenu: (e: MouseEvent) => void;
  onDragStart: (e: DragEvent) => void;
  onDrop?: (e: DragEvent) => void;
  onDragOver?: (e: DragEvent) => void;
  onDragLeave?: (e: DragEvent) => void;
}) {
  return (
    <div
      draggable
      data-path={entry.path}
      data-dir-path={entry.isDir ? entry.path : undefined}
      onDragStart={onDragStart}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      className={`grid grid-cols-[1fr_90px_140px] items-center gap-3 rounded-md px-2.5 py-1.5 text-sm transition-colors cursor-pointer ${
        isDropTarget
          ? "bg-accent/25 ring-1 ring-inset ring-accent/60 text-foreground"
          : selected
          ? "bg-accent/15 text-foreground"
          : "text-foreground hover:bg-surface-2"
      } ${isActive ? "ring-1 ring-inset ring-accent/50" : ""}`}
    >
      <span className="flex items-center gap-2 truncate">
        {compareStatus && compareStatus !== "same" && (
          <span
            className={`size-1.5 shrink-0 rounded-full ${COMPARE_STYLE[compareStatus].dot}`}
            title={COMPARE_STYLE[compareStatus].title}
          />
        )}
        <FileIcon name={entry.name} isDir={entry.isDir} isSymlink={entry.isSymlink} />
        <span className="flex min-w-0 flex-col truncate">
          <span className="truncate">
            {entry.name}
            {entry.symlinkTarget && (
              <span className="ml-1.5 text-xs text-foreground-muted" title={entry.symlinkTarget}>
                → {entry.symlinkTarget}
              </span>
            )}
          </span>
          {subPath && <span className="truncate text-xs text-foreground-muted">{subPath}</span>}
        </span>
      </span>
      <span
        className="text-right text-xs text-foreground-muted"
        title={entry.isDir ? undefined : `${entry.size.toLocaleString()} bytes`}
      >
        {entry.isDir ? "" : formatBytes(entry.size)}
      </span>
      <span className="truncate text-xs text-foreground-muted" title={permissionsToString(entry.permissions)}>
        {formatDate(entry.modified ? entry.modified * 1000 : null)}
      </span>
    </div>
  );
}
