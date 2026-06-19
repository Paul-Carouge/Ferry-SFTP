"use client";

import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { FilePane } from "@/components/browser/FilePane";
import { PreviewPanel } from "@/components/preview/PreviewPanel";
import { useLocalPaneStore, createPaneStore } from "@/lib/stores/paneStore";
import { transfersApi, type RemoteEntry } from "@/lib/api";
import { joinPath } from "@/lib/path";
import { useToastStore } from "@/lib/stores/toastStore";
import type { ConnectionSession } from "@/lib/stores/connectionsStore";
import { useT } from "@/lib/i18n/useT";

export function DualPane({
  session,
  localHome,
}: {
  session: ConnectionSession;
  localHome: string;
}) {
  const t = useT();
  const [remoteStore] = useState(() =>
    createPaneStore(session.defaultRemotePath || session.homeDir || "/"),
  );
  const [splitPercent, setSplitPercent] = useState(50);
  const [preview, setPreview] = useState<{ side: "local" | "remote"; entry: RemoteEntry } | null>(
    null,
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const remotePaneRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const pushToast = useToastStore((s) => s.push);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    getCurrentWindow()
      .onDragDropEvent((event) => {
        if (event.payload.type !== "drop") return;
        const rect = remotePaneRef.current?.getBoundingClientRect();
        if (!rect) return;
        const { x, y } = event.payload.position.toLogical(window.devicePixelRatio);
        const inRemotePane =
          x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
        if (!inRemotePane) return;

        const cwd = remoteStore.getState().cwd;
        for (const localPath of event.payload.paths) {
          const name = localPath.split(/[/\\]/).pop() ?? localPath;
          transfersApi
            .enqueueUpload(session.id, localPath, joinPath(cwd, name))
            .catch((err) => pushToast(t("toast.couldntStartUpload", { error: String(err) }), "error"));
        }
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => unlisten?.();
  }, [remoteStore, session.id, pushToast, t]);

  function onDividerDown() {
    dragging.current = true;
    function onMove(e: MouseEvent) {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const percent = ((e.clientX - rect.left) / rect.width) * 100;
      setSplitPercent(Math.min(80, Math.max(20, percent)));
    }
    function onUp() {
      dragging.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  return (
    <div ref={containerRef} className="relative flex flex-1 overflow-hidden">
      <div style={{ width: `${splitPercent}%` }} className="flex min-w-0">
        <FilePane
          side="local"
          transferConnectionId={session.id}
          initialPath={localHome}
          title={t("filePane.thisComputer")}
          store={useLocalPaneStore}
          peerStore={remoteStore}
          onPreview={(entry) => setPreview({ side: "local", entry })}
        />
      </div>
      <div
        onMouseDown={onDividerDown}
        className="w-1 shrink-0 cursor-col-resize bg-border transition-colors hover:bg-accent"
      />
      <div ref={remotePaneRef} style={{ width: `${100 - splitPercent}%` }} className="flex min-w-0">
        <FilePane
          side="remote"
          connectionId={session.id}
          transferConnectionId={session.id}
          initialPath={session.defaultRemotePath || session.homeDir || "/"}
          title={session.label}
          store={remoteStore}
          peerStore={useLocalPaneStore}
          onPreview={(entry) => setPreview({ side: "remote", entry })}
        />
      </div>

      {preview && (
        <PreviewPanel
          entry={preview.entry}
          connectionId={preview.side === "remote" ? session.id : undefined}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}
