import type { DragEvent, MouseEvent } from "react";
import { FileIcon } from "@/components/common/FileIcon";
import { formatBytes, formatDate, permissionsToString } from "@/lib/format";
import type { RemoteEntry } from "@/lib/api";

export function FileRow({
  entry,
  selected,
  subPath,
  isDropTarget,
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
  subPath?: string;
  isDropTarget?: boolean;
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
      }`}
    >
      <span className="flex items-center gap-2 truncate">
        <FileIcon name={entry.name} isDir={entry.isDir} isSymlink={entry.isSymlink} />
        <span className="flex min-w-0 flex-col truncate">
          <span className="truncate">{entry.name}</span>
          {subPath && <span className="truncate text-xs text-foreground-muted">{subPath}</span>}
        </span>
      </span>
      <span className="text-right text-xs text-foreground-muted">
        {entry.isDir ? "" : formatBytes(entry.size)}
      </span>
      <span className="truncate text-xs text-foreground-muted" title={permissionsToString(entry.permissions)}>
        {formatDate(entry.modified ? entry.modified * 1000 : null)}
      </span>
    </div>
  );
}
