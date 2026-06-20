"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { Edit2, Save, X, XCircle } from "lucide-react";
import { localFsApi, sftpApi, type RemoteEntry } from "@/lib/api";
import { formatBytes, formatDate } from "@/lib/format";
import { slideInFromLeft } from "@/lib/animations";
import { useToastStore } from "@/lib/stores/toastStore";

const CodeMirrorEditor = dynamic(
  () => import("@/components/editor/CodeMirrorEditor").then((m) => m.CodeMirrorEditor),
  {
    ssr: false,
    loading: () => <p className="p-4 text-sm text-foreground-muted">Loading editor…</p>,
  },
);

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
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState("");
  const [saving, setSaving] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const pushToast = useToastStore((s) => s.push);

  useEffect(() => {
    if (panelRef.current) slideInFromLeft(panelRef.current);
  }, []);

  useEffect(() => {
    let revokeUrl: string | null = null;
    // Kicks off the async fetch below; not deriving render state, so the
    // cascading-render warning doesn't apply here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setIsEditing(false);

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
        const decoded = new TextDecoder().decode(bytes);
        setText(decoded);
        setEditedText(decoded);
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

  async function handleSave() {
    setSaving(true);
    try {
      const content = Array.from(new TextEncoder().encode(editedText));
      if (connectionId) {
        await sftpApi.writeFile(connectionId, entry.path, content);
      } else {
        await localFsApi.writeFile(entry.path, content);
      }
      setText(editedText);
      setIsEditing(false);
      pushToast(`Saved ${entry.name}`, "success");
    } catch (err) {
      pushToast(`Save failed: ${String(err)}`, "error");
    } finally {
      setSaving(false);
    }
  }

  const truncated = entry.size > PREVIEW_LIMIT;
  const canEdit = kind === "text" && !truncated;

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
        <div className="flex shrink-0 items-center gap-1">
          {canEdit && !isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="rounded-md p-1 text-foreground-muted hover:bg-surface-2 hover:text-foreground"
              title="Edit file"
            >
              <Edit2 className="size-4" />
            </button>
          )}
          {isEditing && (
            <>
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-md p-1 text-success hover:bg-surface-2 disabled:opacity-50"
                title="Save"
              >
                <Save className="size-4" />
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setEditedText(text);
                }}
                className="rounded-md p-1 text-foreground-muted hover:bg-surface-2 hover:text-foreground"
                title="Cancel editing"
              >
                <XCircle className="size-4" />
              </button>
            </>
          )}
          <button
            onClick={onClose}
            className="rounded-md p-1 text-foreground-muted hover:bg-surface-2 hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      <div className="relative flex-1 overflow-hidden">
        {loading ? (
          <p className="p-4 text-sm text-foreground-muted">Loading preview…</p>
        ) : kind === "image" && imageUrl ? (
          <div className="overflow-auto p-4">
            {/* next/image can't optimize blob: URLs, and this build is unoptimized static export anyway. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt={entry.name} className="max-w-full rounded-md" />
          </div>
        ) : kind === "text" ? (
          <CodeMirrorEditor
            filename={entry.name}
            value={isEditing ? editedText : text}
            readOnly={!isEditing}
            onChange={isEditing ? setEditedText : undefined}
          />
        ) : (
          <p className="p-4 text-sm text-foreground-muted">Can&apos;t preview this file type.</p>
        )}
        {!isEditing && truncated && (
          <p className="px-4 py-2 text-xs text-warning">Preview truncated to the first 8 MB.</p>
        )}
      </div>
    </div>
  );
}
