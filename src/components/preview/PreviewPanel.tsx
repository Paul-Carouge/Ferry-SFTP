"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { localFsApi, sftpApi, type RemoteEntry } from "@/lib/api";
import { formatBytes, formatDate } from "@/lib/format";
import { slideInFromLeft } from "@/lib/animations";

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"]);
const PREVIEW_LIMIT = 8 * 1024 * 1024;

function extOf(name: string) {
  const idx = name.lastIndexOf(".");
  return idx === -1 ? "" : name.slice(idx + 1).toLowerCase();
}

function looksBinary(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, Math.min(bytes.length, 4096));
  let suspicious = 0;
  for (const byte of sample) {
    if (byte === 0) return true;
    if (byte < 9 || (byte > 13 && byte < 32)) suspicious++;
  }
  return suspicious / Math.max(sample.length, 1) > 0.1;
}

type PreviewKind = "image" | "text" | "binary";

export function PreviewPanel({
  entry,
  connectionId,
  onClose,
}: {
  entry: RemoteEntry;
  connectionId?: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState<PreviewKind>("binary");
  const [text, setText] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (panelRef.current) slideInFromLeft(panelRef.current);
  }, []);

  useEffect(() => {
    let revokeUrl: string | null = null;
    // Kicks off the async fetch below; not deriving render state, so the
    // cascading-render warning doesn't apply here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);

    (async () => {
      const bytes = connectionId
        ? await sftpApi.readPreview(connectionId, entry.path)
        : await localFsApi.readPreview(entry.path);

      if (IMAGE_EXT.has(extOf(entry.name))) {
        const blob = new Blob([bytes as BlobPart]);
        const url = URL.createObjectURL(blob);
        revokeUrl = url;
        setImageUrl(url);
        setKind("image");
      } else if (!looksBinary(bytes)) {
        setText(new TextDecoder().decode(bytes));
        setKind("text");
      } else {
        setKind("binary");
      }
    })()
      .catch(() => setKind("binary"))
      .finally(() => setLoading(false));

    return () => {
      if (revokeUrl) URL.revokeObjectURL(revokeUrl);
    };
  }, [entry.path, connectionId, entry.name]);

  const truncated = entry.size > PREVIEW_LIMIT;

  return (
    <div
      ref={panelRef}
      className="absolute inset-y-0 right-0 z-40 flex w-[420px] flex-col border-l border-border bg-surface-1 shadow-2xl"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{entry.name}</p>
          <p className="text-xs text-foreground-muted">
            {formatBytes(entry.size)} · {formatDate(entry.modified ? entry.modified * 1000 : null)}
          </p>
        </div>
        <button onClick={onClose} className="rounded-md p-1 text-foreground-muted hover:bg-surface-2 hover:text-foreground">
          <X className="size-4" />
        </button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <p className="text-sm text-foreground-muted">Loading preview…</p>
        ) : kind === "image" && imageUrl ? (
          // next/image can't optimize blob: URLs, and this build is unoptimized static export anyway.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={entry.name} className="max-w-full rounded-md" />
        ) : kind === "text" ? (
          <pre className="whitespace-pre-wrap break-words font-mono text-xs text-foreground">{text}</pre>
        ) : (
          <p className="text-sm text-foreground-muted">Can&apos;t preview this file type.</p>
        )}
        {truncated && (
          <p className="mt-3 text-xs text-warning">Preview truncated to the first 8 MB.</p>
        )}
      </div>
    </div>
  );
}
