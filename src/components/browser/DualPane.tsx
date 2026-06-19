"use client";

import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { FilePane } from "@/components/browser/FilePane";
import { PreviewPanel } from "@/components/preview/PreviewPanel";
import { ConflictDialog } from "@/components/transfers/ConflictDialog";
import { useLocalPaneStore, createPaneStore } from "@/lib/stores/paneStore";
import {
  localFsApi,
  transfersApi,
  type RemoteEntry,
  type TransferDirection,
  type TransferPlanItem,
} from "@/lib/api";
import { joinPath } from "@/lib/path";
import { resolveAndEnqueue, type ConflictChoice } from "@/lib/transferResolve";
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
  const [conflictPrompt, setConflictPrompt] = useState<{
    path: string;
    resolve: (choice: ConflictChoice) => void;
  } | null>(null);

  function promptConflict(path: string): Promise<ConflictChoice> {
    return new Promise((resolve) => {
      setConflictPrompt({
        path,
        resolve: (choice) => {
          setConflictPrompt(null);
          resolve(choice);
        },
      });
    });
  }

  async function sendTransfer(
    direction: TransferDirection,
    sourcePath: string,
    destPath: string,
    isDir: boolean,
    size: number,
  ) {
    try {
      const localPath = direction === "upload" ? sourcePath : destPath;
      const remotePath = direction === "upload" ? destPath : sourcePath;
      const items: TransferPlanItem[] = isDir
        ? await transfersApi.planFolder(session.id, direction, localPath, remotePath)
        : [{ localPath, remotePath, size, isDir: false }];
      await resolveAndEnqueue(session.id, direction, items, promptConflict);
    } catch (err) {
      pushToast(t("toast.couldntStartTransfer", { error: String(err) }), "error");
    }
  }

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
          localFsApi
            .stat(localPath)
            .then((stat) => sendTransfer("upload", localPath, joinPath(cwd, name), stat.isDir, stat.size))
            .catch((err) => pushToast(t("toast.couldntStartUpload", { error: String(err) }), "error"));
        }
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => unlisten?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          onTransfer={sendTransfer}
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
          onTransfer={sendTransfer}
        />
      </div>

      {preview && (
        <PreviewPanel
          entry={preview.entry}
          connectionId={preview.side === "remote" ? session.id : undefined}
          onClose={() => setPreview(null)}
        />
      )}

      {conflictPrompt && (
        <ConflictDialog
          key={conflictPrompt.path}
          open
          path={conflictPrompt.path}
          onResolve={conflictPrompt.resolve}
        />
      )}
    </div>
  );
}
