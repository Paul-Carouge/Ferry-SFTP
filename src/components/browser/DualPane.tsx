"use client";

import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Link2, Link2Off, GitCompare } from "lucide-react";
import { FilePane } from "@/components/browser/FilePane";
import { PreviewPanel } from "@/components/preview/PreviewPanel";
import { ConflictDialog } from "@/components/transfers/ConflictDialog";
import { useLocalPaneStore, createPaneStore } from "@/lib/stores/paneStore";
import {
  localFsApi,
  transfersApi,
  onTransferUpdate,
  type RemoteEntry,
  type TransferDirection,
  type TransferPlanItem,
} from "@/lib/api";
import { joinPath, parentPath } from "@/lib/path";
import { resolveAndEnqueue, type ConflictChoice } from "@/lib/transferResolve";
import { useToastStore } from "@/lib/stores/toastStore";
import type { ConnectionSession } from "@/lib/stores/connectionsStore";
import { useT } from "@/lib/i18n/useT";
import { getDragPayloads, setDragPayloads, getLastDragPos, setLastDragPos } from "@/lib/dragState";

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
  const [syncBrowsing, setSyncBrowsing] = useState(false);
  const [compare, setCompare] = useState(false);
  const [preview, setPreview] = useState<{ side: "local" | "remote"; entry: RemoteEntry } | null>(
    null,
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const localPaneRef = useRef<HTMLDivElement>(null);
  const remotePaneRef = useRef<HTMLDivElement>(null);
  const sendTransferRef = useRef(sendTransfer);
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

  // Keep ref current so the dragend fallback handler always calls the latest sendTransfer.
  useEffect(() => {
    sendTransferRef.current = sendTransfer;
  });

  // WKWebView fallback: Tauri's native drag-drop handler (dragDropEnabled, on by
  // default) swallows the webview's HTML5 `drop`/`dragover` for in-app element
  // drags, so FilePane.handleDrop never fires. The `dragend` event on the source
  // element is our reliable path. We can't trust the pane `onDragOver` to fire over
  // the destination, so we track the cursor continuously via window-level `drag`/
  // `dragover` (capture) and fall back to the `dragend` event's own coordinates.
  useEffect(() => {
    function trackPos(e: globalThis.DragEvent) {
      if (e.clientX || e.clientY) setLastDragPos(e.clientX, e.clientY);
    }

    // If the cursor is over a directory row, drop INTO that folder (the HTML5
    // subfolder drop is also dead in WKWebView), otherwise into the pane's cwd.
    function directoryPathAt(x: number, y: number): string | null {
      const el = document.elementFromPoint(x, y);
      const row = el?.closest?.("[data-dir-path]") as HTMLElement | null;
      return row?.getAttribute("data-dir-path") ?? null;
    }

    function handleDragEnd(e: globalThis.DragEvent) {
      const payloads = getDragPayloads();
      if (!payloads) return;
      setDragPayloads(null);

      let { x, y } = getLastDragPos();
      if (e.clientX || e.clientY) {
        x = e.clientX;
        y = e.clientY;
      }

      const localRect = localPaneRef.current?.getBoundingClientRect();
      const remoteRect = remotePaneRef.current?.getBoundingClientRect();

      const inLocal =
        localRect && x >= localRect.left && x <= localRect.right && y >= localRect.top && y <= localRect.bottom;
      const inRemote =
        remoteRect && x >= remoteRect.left && x <= remoteRect.right && y >= remoteRect.top && y <= remoteRect.bottom;

      const dirUnderCursor = directoryPathAt(x, y);

      if (inLocal) {
        const dest = dirUnderCursor ?? useLocalPaneStore.getState().cwd;
        for (const payload of payloads) {
          if (payload.side !== "remote" || payload.path === dest) continue;
          void sendTransferRef.current(
            "download",
            payload.path,
            joinPath(dest, payload.name),
            payload.isDir,
            payload.size,
          );
        }
      } else if (inRemote) {
        const dest = dirUnderCursor ?? remoteStore.getState().cwd;
        for (const payload of payloads) {
          if (payload.side !== "local" || payload.path === dest) continue;
          void sendTransferRef.current(
            "upload",
            payload.path,
            joinPath(dest, payload.name),
            payload.isDir,
            payload.size,
          );
        }
      }
    }

    window.addEventListener("drag", trackPos, true);
    window.addEventListener("dragover", trackPos, true);
    window.addEventListener("dragend", handleDragEnd);
    return () => {
      window.removeEventListener("drag", trackPos, true);
      window.removeEventListener("dragover", trackPos, true);
      window.removeEventListener("dragend", handleDragEnd);
    };
  }, [remoteStore]);

  // Auto-refresh the destination pane when a transfer lands in (or under) its cwd.
  // Folder transfers emit many member records; debounce so we re-list once per burst.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const timers: { local: ReturnType<typeof setTimeout> | null; remote: ReturnType<typeof setTimeout> | null } = {
      local: null,
      remote: null,
    };
    const within = (dir: string, cwd: string) =>
      dir === cwd || dir.startsWith(cwd.endsWith("/") ? cwd : `${cwd}/`);
    const schedule = (sidePane: "local" | "remote") => {
      if (timers[sidePane]) return;
      timers[sidePane] = setTimeout(() => {
        timers[sidePane] = null;
        if (sidePane === "local") useLocalPaneStore.getState().bumpRefresh();
        else remoteStore.getState().bumpRefresh();
      }, 200);
    };

    onTransferUpdate((record) => {
      if (record.state !== "completed") return;
      if (record.direction === "upload") {
        if (within(parentPath(record.remotePath), remoteStore.getState().cwd)) schedule("remote");
      } else if (within(parentPath(record.localPath), useLocalPaneStore.getState().cwd)) {
        schedule("local");
      }
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
      if (timers.local) clearTimeout(timers.local);
      if (timers.remote) clearTimeout(timers.remote);
    };
  }, [remoteStore]);

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

  // Synchronized browsing: mirror a navigation onto the peer pane by the same
  // relative move (descend into the same subfolder, or pop the same number of levels).
  // Lateral jumps that can't be mapped are left alone.
  function mirrorNav(
    prevCwd: string,
    nextCwd: string,
    peer: typeof useLocalPaneStore | typeof remoteStore,
  ) {
    if (!syncBrowsing || nextCwd === prevCwd) return;
    const isInside = (parent: string, child: string) =>
      child.startsWith(parent === "/" ? "/" : `${parent}/`);
    const peerCwd = peer.getState().cwd;
    if (isInside(prevCwd, nextCwd)) {
      const tail = nextCwd.slice(prevCwd === "/" ? 1 : prevCwd.length + 1);
      const peerTarget = tail.split("/").filter(Boolean).reduce((acc, seg) => joinPath(acc, seg), peerCwd);
      peer.getState().requestNavigate(peerTarget);
    } else if (isInside(nextCwd, prevCwd)) {
      const ups = prevCwd.slice(nextCwd === "/" ? 1 : nextCwd.length + 1).split("/").filter(Boolean).length;
      let p = peerCwd;
      for (let i = 0; i < ups; i++) p = parentPath(p);
      peer.getState().requestNavigate(p);
    }
  }

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
      <div ref={localPaneRef} style={{ width: `${splitPercent}%` }} className="flex min-w-0">
        <FilePane
          side="local"
          initialPath={localHome}
          title={t("filePane.thisComputer")}
          store={useLocalPaneStore}
          peerStore={remoteStore}
          onPreview={(entry) => setPreview({ side: "local", entry })}
          onTransfer={sendTransfer}
          onNavigate={(next, prev) => mirrorNav(prev, next, remoteStore)}
          compareEnabled={compare}
        />
      </div>
      <div
        onMouseDown={onDividerDown}
        className="w-1 shrink-0 cursor-col-resize bg-border transition-colors hover:bg-accent"
      />
      <button
        onClick={() => setSyncBrowsing((v) => !v)}
        title={syncBrowsing ? t("filePane.syncOn") : t("filePane.syncOff")}
        style={{ left: `${splitPercent}%` }}
        className={`absolute top-1 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full border px-2 py-0.5 text-xs shadow-sm transition-colors ${
          syncBrowsing
            ? "border-accent bg-accent/15 text-accent"
            : "border-border bg-surface-1 text-foreground-muted hover:text-foreground"
        }`}
      >
        {syncBrowsing ? <Link2 className="size-3" /> : <Link2Off className="size-3" />}
      </button>
      <button
        onClick={() => setCompare((v) => !v)}
        title={compare ? t("filePane.compareClear") : t("filePane.compare")}
        style={{ left: `${splitPercent}%` }}
        className={`absolute top-8 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full border px-2 py-0.5 text-xs shadow-sm transition-colors ${
          compare
            ? "border-accent bg-accent/15 text-accent"
            : "border-border bg-surface-1 text-foreground-muted hover:text-foreground"
        }`}
      >
        <GitCompare className="size-3" />
      </button>
      <div ref={remotePaneRef} style={{ width: `${100 - splitPercent}%` }} className="flex min-w-0">
        <FilePane
          side="remote"
          connectionId={session.id}
          initialPath={session.defaultRemotePath || session.homeDir || "/"}
          title={session.label}
          store={remoteStore}
          peerStore={useLocalPaneStore}
          onPreview={(entry) => setPreview({ side: "remote", entry })}
          onTransfer={sendTransfer}
          onNavigate={(next, prev) => mirrorNav(prev, next, useLocalPaneStore)}
          compareEnabled={compare}
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
