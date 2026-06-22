"use client";

/* This pane loads directory listings from effects (mount, refresh nonce, synchronized
   browsing), which legitimately set loading/entries state. The async loaders trip
   react-hooks/set-state-in-effect through their call chain, so it's disabled file-wide. */
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useRef, useState, type DragEvent, type MouseEvent } from "react";
import type { StoreApi, UseBoundStore } from "zustand";
import { open as openDialog, save as saveFileDialog } from "@tauri-apps/plugin-dialog";
import { ChevronDown, ChevronUp, FolderPlus, RefreshCw, Search } from "lucide-react";
import { Breadcrumbs } from "@/components/browser/Breadcrumbs";
import { FileRow } from "@/components/browser/FileRow";
import { ContextMenu, type ContextMenuItem } from "@/components/common/ContextMenu";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { PromptDialog } from "@/components/common/PromptDialog";
import { localFsApi, sftpApi, type RemoteEntry, type TransferDirection } from "@/lib/api";
import { joinPath, parentPath } from "@/lib/path";
import { useToastStore } from "@/lib/stores/toastStore";
import { useSettingsStore } from "@/lib/stores/settingsStore";
import { useEditWatchStore } from "@/lib/stores/editWatchStore";
import { useStaggerOnChange } from "@/lib/animations";
import { useT } from "@/lib/i18n/useT";
import type { PaneEntry } from "@/lib/stores/paneStore";
import {
  type DragPayload,
  getDragPayloads,
  setDragPayloads,
  setLastDragPos,
} from "@/lib/dragState";

export type { DragPayload };

interface PaneStoreState {
  cwd: string;
  entries: PaneEntry[];
  loading: boolean;
  error: string | null;
  selected: Set<string>;
  filter: string;
  refreshNonce: number;
  requestedPath: string | null;
  requestNavigate: (path: string) => void;
  clearRequestedPath: () => void;
  setCwd: (cwd: string) => void;
  setEntries: (entries: PaneEntry[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  toggleSelected: (path: string, exclusive?: boolean) => void;
  setSelection: (paths: string[]) => void;
  clearSelection: () => void;
  setFilter: (filter: string) => void;
}

export function FilePane({
  side,
  connectionId,
  initialPath,
  title,
  store,
  peerStore,
  onPreview,
  onTransfer,
  onNavigate,
}: {
  side: "local" | "remote";
  connectionId?: string;
  initialPath: string;
  title: string;
  store: UseBoundStore<StoreApi<PaneStoreState>>;
  /** The other pane's store, used to know where to save/send files initiated from a context menu (no drag target to read a destination from). */
  peerStore: UseBoundStore<StoreApi<PaneStoreState>>;
  onPreview: (entry: RemoteEntry) => void;
  /** Plans/resolves conflicts/enqueues a transfer; owned by the parent DualPane so both panes and OS drag-drop share one conflict-resolution flow. */
  onTransfer: (
    direction: TransferDirection,
    sourcePath: string,
    destPath: string,
    isDir: boolean,
    size: number,
  ) => Promise<void>;
  /** Fired when the user navigates this pane (not on programmatic/mirror reloads), enabling synchronized browsing. */
  onNavigate?: (nextCwd: string, prevCwd: string) => void;
}) {
  const {
    cwd,
    entries,
    loading,
    error,
    selected,
    filter,
    refreshNonce,
    requestedPath,
    clearRequestedPath,
    setCwd,
    setEntries,
    setLoading,
    setError,
    toggleSelected,
    setSelection,
    clearSelection,
    setFilter,
  } = store();

  const t = useT();
  const pushToast = useToastStore((s) => s.push);
  const showHiddenFiles = useSettingsStore((s) => s.showHiddenFiles);
  const startEdit = useEditWatchStore((s) => s.start);
  const stopEdit = useEditWatchStore((s) => s.stop);
  const editWatches = useEditWatchStore((s) => s.watches);
  const listRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; entry?: RemoteEntry; batch?: RemoteEntry[] } | null>(null);
  const [deleting, setDeleting] = useState<RemoteEntry | null>(null);
  const [deletingBatch, setDeletingBatch] = useState<RemoteEntry[] | null>(null);
  const [renaming, setRenaming] = useState<RemoteEntry | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<RemoteEntry[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [sortKey, setSortKey] = useState<"name" | "size" | "modified">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [activePath, setActivePath] = useState<string | null>(null);
  const [editingPath, setEditingPath] = useState(false);
  const [pathDraft, setPathDraft] = useState("");

  useStaggerOnChange(listRef, [entries, filter]);

  useEffect(() => {
    const query = filter.trim();
    if (!query) {
      // Resetting search state when the query is cleared, not syncing from an external source.
      setSearchResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const handle = setTimeout(async () => {
      try {
        const results =
          side === "local"
            ? await localFsApi.search(cwd, query)
            : await sftpApi.search(connectionId!, cwd, query);
        setSearchResults(results);
      } catch (err) {
        pushToast(t("toast.searchFailed", { error: String(err) }), "error");
        setSearchResults(null);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, cwd, side, connectionId]);

  /** Lists `path`. `mirror` reloads (mount, refresh, synchronized-browsing echoes) don't re-emit onNavigate. */
  async function loadInternal(path: string, mirror: boolean) {
    const prev = cwd;
    setLoading(true);
    setError(null);
    try {
      const list = side === "local" ? await localFsApi.listDir(path) : await sftpApi.listDir(connectionId!, path);
      setEntries(list);
      setCwd(path);
      clearSelection();
      setActivePath(null);
      if (!mirror && path !== prev) onNavigate?.(path, prev);
    } catch (err) {
      setError(String(err));
      pushToast(t("toast.couldntOpen", { path }), "error");
    } finally {
      setLoading(false);
    }
  }

  /** User-initiated navigation (emits onNavigate for synchronized browsing). */
  function load(path: string) {
    return loadInternal(path, false);
  }

  /** Re-list the current directory without emitting a navigation. */
  function reload() {
    return loadInternal(cwd, true);
  }

  useEffect(() => {
    loadInternal(initialPath, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-list the current directory when something (e.g. a finished transfer) bumps the nonce.
  useEffect(() => {
    if (refreshNonce === 0) return;
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshNonce]);

  // Synchronized browsing: the peer pane asks us to navigate without echoing back.
  useEffect(() => {
    if (!requestedPath) return;
    const target = requestedPath;
    clearRequestedPath();
    if (target !== cwd) loadInternal(target, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedPath]);

  function navigate(entry: RemoteEntry) {
    if (entry.isDir) {
      setFilter("");
      load(entry.path);
    } else {
      onPreview(entry);
    }
  }

  async function createFolder(name: string) {
    setCreatingFolder(false);
    const path = joinPath(cwd, name);
    try {
      if (side === "local") await localFsApi.mkdir(path);
      else await sftpApi.mkdir(connectionId!, path);
      reload();
    } catch (err) {
      pushToast(t("toast.couldntCreateFolder", { error: String(err) }), "error");
    }
  }

  async function renameEntry(entry: RemoteEntry, newName: string) {
    setRenaming(null);
    const newPath = joinPath(parentPath(entry.path), newName);
    try {
      if (side === "local") await localFsApi.rename(entry.path, newPath);
      else await sftpApi.rename(connectionId!, entry.path, newPath);
      reload();
    } catch (err) {
      pushToast(t("toast.couldntRename", { error: String(err) }), "error");
    }
  }

  async function deleteEntry(entry: RemoteEntry) {
    setDeleting(null);
    try {
      if (side === "local") await localFsApi.remove(entry.path, entry.isDir);
      else await sftpApi.remove(connectionId!, entry.path, entry.isDir);
      reload();
    } catch (err) {
      pushToast(t("toast.couldntDelete", { error: String(err) }), "error");
    }
  }

  async function deleteBatch(items: RemoteEntry[]) {
    setDeletingBatch(null);
    const results = await Promise.allSettled(
      items.map((e) =>
        side === "local"
          ? localFsApi.remove(e.path, e.isDir)
          : sftpApi.remove(connectionId!, e.path, e.isDir),
      ),
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) {
      pushToast(t("toast.batchDeletePartialFail", { failed, total: items.length }), "error");
    }
    clearSelection();
    reload();
  }

  async function sendBatchToOtherSide(items: RemoteEntry[]) {
    const destDir = peerStore.getState().cwd;
    if (side === "local") {
      for (const entry of items) {
        await onTransfer("upload", entry.path, joinPath(destDir, entry.name), entry.isDir, entry.size);
      }
      return;
    }
    // remote -> local: pick one destination directory for the whole batch
    const destParent = await openDialog({ directory: true, title: t("filePane.chooseDestinationTitle") });
    if (!destParent) return;
    for (const entry of items) {
      await onTransfer("download", entry.path, joinPath(destParent as string, entry.name), entry.isDir, entry.size);
    }
  }

  async function sendToOtherSide(entry: RemoteEntry) {
    const destDir = peerStore.getState().cwd;
    try {
      if (side === "local") {
        // this pane is local, so sending to the other side means uploading to remote
        const remoteTarget = joinPath(destDir, entry.name);
        await onTransfer("upload", entry.path, remoteTarget, entry.isDir, entry.size);
      } else {
        // this pane is remote, so sending to the other side means downloading to local
        let localTarget: string;
        if (entry.isDir) {
          const destParent = await openDialog({
            directory: true,
            title: t("filePane.chooseDestinationTitle"),
          });
          if (!destParent) return;
          localTarget = joinPath(destParent as string, entry.name);
        } else {
          const destination = await saveFileDialog({
            defaultPath: joinPath(destDir, entry.name),
            title: t("filePane.saveAsTitle", { name: entry.name }),
          });
          if (!destination) return;
          localTarget = destination;
        }
        await onTransfer("download", entry.path, localTarget, entry.isDir, entry.size);
      }
    } catch (err) {
      pushToast(t("toast.couldntStartTransfer", { error: String(err) }), "error");
    }
  }

  async function transferEntry(payload: DragPayload, destDir: string) {
    try {
      if (side === "local" && payload.side === "remote") {
        await onTransfer("download", payload.path, joinPath(destDir, payload.name), payload.isDir, payload.size);
      } else if (side === "remote" && payload.side === "local") {
        await onTransfer("upload", payload.path, joinPath(destDir, payload.name), payload.isDir, payload.size);
      }
    } catch (err) {
      pushToast(t("toast.couldntStartTransfer", { error: String(err) }), "error");
    }
  }

  function toggleSort(key: "name" | "size" | "modified") {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function handleRowDragOver(e: DragEvent, entry: RemoteEntry) {
    if (!entry.isDir) return;
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(entry.path);
    setDragOver(false);
  }

  function handleRowDragLeave(e: DragEvent) {
    e.stopPropagation();
    setDropTarget(null);
  }

  function handleRowDrop(e: DragEvent, entry: RemoteEntry) {
    if (!entry.isDir) return;
    e.stopPropagation();
    e.preventDefault();
    setDropTarget(null);
    setDragOver(false);
    const payloads = getDragPayloads();
    setDragPayloads(null);
    if (!payloads) return;
    for (const payload of payloads) {
      if (payload.side === side) continue;
      void transferEntry(payload, entry.path);
    }
  }

  function handleDragStart(e: DragEvent, entry: RemoteEntry) {
    const dragEntries =
      selected.size > 1 && selected.has(entry.path)
        ? filtered.filter((en) => selected.has(en.path))
        : [entry];
    setDragPayloads(
      dragEntries.map((en) => ({
        side,
        connectionId,
        path: en.path,
        name: en.name,
        isDir: en.isDir,
        size: en.size,
      })),
    );
    e.dataTransfer.effectAllowed = "copy";
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const payloads = getDragPayloads();
    setDragPayloads(null);
    if (!payloads) return;
    for (const payload of payloads) {
      if (payload.side === side) continue;
      void transferEntry(payload, cwd);
    }
  }

  const visibleEntries = showHiddenFiles ? entries : entries.filter((e) => !e.name.startsWith("."));
  const quickFiltered = filter
    ? visibleEntries.filter((e) => e.name.toLowerCase().includes(filter.toLowerCase()))
    : visibleEntries;
  const filtered = filter ? (searchResults ?? quickFiltered) : visibleEntries;
  const isSearching = filter.trim().length > 0 && searchResults !== null;

  const sorted = [...filtered].sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    let cmp = 0;
    if (sortKey === "name") cmp = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    else if (sortKey === "size") cmp = (a.size ?? 0) - (b.size ?? 0);
    else cmp = (a.modified ?? 0) - (b.modified ?? 0);
    return sortDir === "asc" ? cmp : -cmp;
  });

  function scrollRowIntoView(path: string) {
    requestAnimationFrame(() => {
      listRef.current?.querySelector(`[data-path="${CSS.escape(path)}"]`)?.scrollIntoView({ block: "nearest" });
    });
  }

  /** Move the keyboard cursor by `delta` rows; `extend` grows the selection instead of replacing it. */
  function moveActive(delta: number, extend: boolean) {
    if (sorted.length === 0) return;
    const curIdx = activePath ? sorted.findIndex((en) => en.path === activePath) : -1;
    const nextIdx =
      curIdx === -1 ? (delta > 0 ? 0 : sorted.length - 1) : Math.max(0, Math.min(sorted.length - 1, curIdx + delta));
    const target = sorted[nextIdx];
    setActivePath(target.path);
    if (extend) {
      const next = new Set(selected);
      if (activePath) next.add(activePath);
      next.add(target.path);
      setSelection([...next]);
    } else {
      toggleSelected(target.path, true);
    }
    scrollRowIntoView(target.path);
  }

  function jumpActive(toEnd: boolean) {
    if (sorted.length === 0) return;
    const target = toEnd ? sorted[sorted.length - 1] : sorted[0];
    setActivePath(target.path);
    toggleSelected(target.path, true);
    scrollRowIntoView(target.path);
  }

  function goUp() {
    const parent = parentPath(cwd);
    if (parent !== cwd) load(parent);
  }

  function openPathBar() {
    setPathDraft(cwd);
    setEditingPath(true);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    const target = e.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

    const sel = sorted.filter((en) => selected.has(en.path));
    const active = activePath ? sorted.find((en) => en.path === activePath) : undefined;
    const focused = active ?? (sel.length === 1 ? sel[0] : undefined);
    const mod = e.metaKey || e.ctrlKey;

    if (mod && e.key.toLowerCase() === "l") {
      e.preventDefault();
      openPathBar();
    } else if (mod && e.key.toLowerCase() === "r") {
      e.preventDefault();
      reload();
    } else if (mod && e.key.toLowerCase() === "a") {
      e.preventDefault();
      setSelection(sorted.map((en) => en.path));
    } else if (mod && e.shiftKey && e.key.toLowerCase() === "n") {
      e.preventDefault();
      setCreatingFolder(true);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      moveActive(1, e.shiftKey);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveActive(-1, e.shiftKey);
    } else if (e.key === "Home") {
      e.preventDefault();
      jumpActive(false);
    } else if (e.key === "End") {
      e.preventDefault();
      jumpActive(true);
    } else if (e.key === "Enter" || e.key === "ArrowRight") {
      if (!focused) return;
      e.preventDefault();
      navigate(focused);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      goUp();
    } else if (e.key === " ") {
      if (!focused) return;
      e.preventDefault();
      if (!focused.isDir) onPreview(focused);
    } else if (e.key === "F2" && focused) {
      e.preventDefault();
      setRenaming(focused);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      if (sel.length > 1) setDeletingBatch(sel);
      else if (sel.length === 1) setDeleting(sel[0]);
      else if (e.key === "Backspace") goUp();
      else if (focused) setDeleting(focused);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setActivePath(null);
      clearSelection();
    }
  }

  async function copyText(text: string, toastKey: "filePane.copiedPath" | "filePane.copiedName") {
    try {
      await navigator.clipboard.writeText(text);
      pushToast(t(toastKey), "success");
    } catch (err) {
      pushToast(String(err), "error");
    }
  }

  async function nativeAction(fn: () => Promise<void>) {
    try {
      await fn();
    } catch (err) {
      pushToast(String(err), "error");
    }
  }

  function rowMenuItems(entry: RemoteEntry): ContextMenuItem[] {
    const items: ContextMenuItem[] = [
      { label: entry.isDir ? t("filePane.open") : t("filePane.preview"), onClick: () => navigate(entry) },
      {
        label: side === "local" ? t("filePane.uploadToRemote") : t("filePane.downloadToLocal"),
        onClick: () => sendToOtherSide(entry),
        separatorBefore: true,
      },
      { label: t("filePane.copyPath"), onClick: () => void copyText(entry.path, "filePane.copiedPath") },
      { label: t("filePane.copyName"), onClick: () => void copyText(entry.name, "filePane.copiedName") },
    ];
    if (side === "local") {
      items.push(
        { label: t("filePane.openWithDefault"), onClick: () => void nativeAction(() => localFsApi.open(entry.path)) },
        { label: t("filePane.revealInFinder"), onClick: () => void nativeAction(() => localFsApi.reveal(entry.path)) },
      );
    } else if (!entry.isDir && connectionId) {
      const watched = `${connectionId}:${entry.path}` in editWatches;
      items.push(
        watched
          ? { label: t("filePane.stopEditing"), onClick: () => void stopEdit(connectionId, entry.path) }
          : { label: t("filePane.editExternal"), onClick: () => void startEdit(connectionId, entry.path) },
      );
    }
    items.push(
      { label: t("filePane.rename"), onClick: () => setRenaming(entry), separatorBefore: true },
      { label: t("filePane.delete"), onClick: () => setDeleting(entry), danger: true },
    );
    return items;
  }

  function batchMenuItems(items: RemoteEntry[]): ContextMenuItem[] {
    return [
      {
        label: t("filePane.sendSelectedToOtherSide", { count: items.length }),
        onClick: () => void sendBatchToOtherSide(items),
      },
      {
        label: t("filePane.deleteSelected", { count: items.length }),
        onClick: () => setDeletingBatch(items),
        danger: true,
        separatorBefore: true,
      },
    ];
  }

  /** Resolves the currently selected paths to entries among the visible rows. */
  function selectedEntries(): RemoteEntry[] {
    return filtered.filter((e) => selected.has(e.path));
  }

  function openRowMenu(e: MouseEvent, entry: RemoteEntry) {
    e.preventDefault();
    e.stopPropagation();
    // If the right-clicked row is part of a multi-selection, act on the whole
    // selection; otherwise act on just this row (Finder/Explorer convention).
    if (selected.size > 1 && selected.has(entry.path)) {
      setMenu({ x: e.clientX, y: e.clientY, batch: selectedEntries() });
    } else {
      setMenu({ x: e.clientX, y: e.clientY, entry });
    }
  }

  function paneMenuItems(): ContextMenuItem[] {
    const items: ContextMenuItem[] = [
      { label: t("filePane.newFolder"), onClick: () => setCreatingFolder(true) },
      { label: t("filePane.goToPath"), onClick: () => openPathBar() },
      { label: t("filePane.copyPath"), onClick: () => void copyText(cwd, "filePane.copiedPath") },
      { label: t("filePane.refresh"), onClick: () => reload() },
    ];
    if (side === "local") {
      items.push(
        { label: t("filePane.revealInFinder"), onClick: () => void nativeAction(() => localFsApi.reveal(cwd)), separatorBefore: true },
        { label: t("filePane.openTerminalHere"), onClick: () => void nativeAction(() => localFsApi.openTerminal(cwd)) },
      );
    }
    return items;
  }

  return (
    <div
      className={`flex min-w-0 flex-1 flex-col overflow-hidden border-border outline-none ${
        side === "local" ? "border-r" : ""
      } ${dragOver ? "bg-accent/5" : ""}`}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onDragEnter={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setDragOver(true);
        setLastDragPos(e.clientX, e.clientY);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
          {title}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCreatingFolder(true)}
            className="rounded-md p-1 text-foreground-muted hover:bg-surface-2 hover:text-foreground"
            title={t("filePane.newFolder")}
          >
            <FolderPlus className="size-3.5" />
          </button>
          <button
            onClick={() => reload()}
            className="rounded-md p-1 text-foreground-muted hover:bg-surface-2 hover:text-foreground"
            title={t("filePane.refresh")}
          >
            <RefreshCw className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        {editingPath ? (
          <input
            autoFocus
            value={pathDraft}
            onChange={(e) => setPathDraft(e.target.value)}
            onBlur={() => setEditingPath(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const next = pathDraft.trim();
                setEditingPath(false);
                if (next && next !== cwd) load(next);
              } else if (e.key === "Escape") {
                e.preventDefault();
                setEditingPath(false);
              }
            }}
            placeholder={t("filePane.goToPathPlaceholder")}
            className="w-full rounded-md border border-accent/50 bg-surface-2 px-2 py-1 font-mono text-sm text-foreground outline-none"
          />
        ) : (
          <div onDoubleClick={openPathBar} title={t("filePane.goToPath")} className="min-w-0 flex-1">
            <Breadcrumbs path={cwd} onNavigate={load} />
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1.5">
        <Search className="size-3.5 text-foreground-muted" />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") { setFilter(""); (e.target as HTMLInputElement).blur(); } }}
          placeholder={t("filePane.searchPlaceholder")}
          className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-foreground-muted"
        />
        {searching && <span className="shrink-0 text-xs text-foreground-muted">{t("filePane.searching")}</span>}
      </div>

      <div className="grid shrink-0 grid-cols-[1fr_90px_140px] gap-3 border-b border-border px-4 py-1">
        <button
          onClick={() => toggleSort("name")}
          className="flex items-center gap-1 text-left text-xs font-medium text-foreground-muted hover:text-foreground"
        >
          {t("filePane.columnName")}
          {sortKey === "name" && (sortDir === "asc" ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />)}
        </button>
        <button
          onClick={() => toggleSort("size")}
          className="flex items-center justify-end gap-1 text-right text-xs font-medium text-foreground-muted hover:text-foreground"
        >
          {sortKey === "size" && (sortDir === "asc" ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />)}
          {t("filePane.columnSize")}
        </button>
        <button
          onClick={() => toggleSort("modified")}
          className="flex items-center gap-1 text-left text-xs font-medium text-foreground-muted hover:text-foreground"
        >
          {t("filePane.columnModified")}
          {sortKey === "modified" && (sortDir === "asc" ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />)}
        </button>
      </div>

      <div
        ref={listRef}
        className="flex-1 overflow-y-auto p-1.5"
        onContextMenu={(e: MouseEvent) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
      >
        {loading && entries.length === 0 ? (
          <p className="p-3 text-sm text-foreground-muted">{t("filePane.loading")}</p>
        ) : error ? (
          <p className="p-3 text-sm text-danger">{error}</p>
        ) : sorted.length === 0 ? (
          <p className="p-3 text-sm text-foreground-muted">{t("filePane.emptyFolder")}</p>
        ) : (
          sorted.map((entry) => {
            const dir = parentPath(entry.path);
            const subPath =
              isSearching && dir !== cwd
                ? dir.startsWith(cwd)
                  ? dir.slice(cwd.length).replace(/^\//, "") || "/"
                  : dir
                : undefined;
            return (
              <FileRow
                key={entry.path}
                entry={entry}
                selected={selected.has(entry.path)}
                isActive={activePath === entry.path}
                subPath={subPath}
                isDropTarget={dropTarget === entry.path}
                onClick={(e) => {
                  setActivePath(entry.path);
                  toggleSelected(entry.path, !(e.metaKey || e.ctrlKey));
                }}
                onDoubleClick={() => navigate(entry)}
                onContextMenu={(e) => openRowMenu(e, entry)}
                onDragStart={(e) => handleDragStart(e, entry)}
                onDrop={entry.isDir ? (e) => handleRowDrop(e, entry) : undefined}
                onDragOver={entry.isDir ? (e) => handleRowDragOver(e, entry) : undefined}
                onDragLeave={entry.isDir ? handleRowDragLeave : undefined}
              />
            );
          })
        )}
      </div>

      {selected.size > 0 && (
        <div className="shrink-0 border-t border-border px-3 py-1.5 text-xs text-foreground-muted">
          {t("filePane.selectedCount", { count: selected.size })}
        </div>
      )}

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={
            menu.batch
              ? batchMenuItems(menu.batch)
              : menu.entry
                ? rowMenuItems(menu.entry)
                : paneMenuItems()
          }
          onClose={() => setMenu(null)}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title={t("filePane.deleteTitle", { name: deleting?.name ?? "" })}
        description={deleting?.isDir ? t("filePane.deleteFolderDesc") : undefined}
        confirmLabel={t("filePane.delete")}
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && deleteEntry(deleting)}
      />

      <ConfirmDialog
        open={deletingBatch !== null}
        title={t("filePane.deleteSelectedTitle", { count: deletingBatch?.length ?? 0 })}
        description={t("filePane.deleteFolderDesc")}
        confirmLabel={t("filePane.delete")}
        danger
        onCancel={() => setDeletingBatch(null)}
        onConfirm={() => deletingBatch && deleteBatch(deletingBatch)}
      />

      <PromptDialog
        open={renaming !== null}
        title={t("filePane.renameTitle")}
        label={t("filePane.renameLabel")}
        initialValue={renaming?.name ?? ""}
        confirmLabel={t("filePane.rename")}
        onCancel={() => setRenaming(null)}
        onSubmit={(value) => renaming && renameEntry(renaming, value)}
      />

      <PromptDialog
        open={creatingFolder}
        title={t("filePane.newFolderTitle")}
        label={t("filePane.folderNameLabel")}
        confirmLabel={t("filePane.create")}
        onCancel={() => setCreatingFolder(false)}
        onSubmit={createFolder}
      />
    </div>
  );
}
