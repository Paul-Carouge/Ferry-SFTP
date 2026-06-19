"use client";

import { useEffect, useRef, useState, type DragEvent, type MouseEvent } from "react";
import type { StoreApi, UseBoundStore } from "zustand";
import { save as saveFileDialog } from "@tauri-apps/plugin-dialog";
import { FolderPlus, RefreshCw, Search } from "lucide-react";
import { Breadcrumbs } from "@/components/browser/Breadcrumbs";
import { FileRow } from "@/components/browser/FileRow";
import { ContextMenu, type ContextMenuItem } from "@/components/common/ContextMenu";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { PromptDialog } from "@/components/common/PromptDialog";
import { localFsApi, sftpApi, transfersApi, type RemoteEntry } from "@/lib/api";
import { joinPath, parentPath } from "@/lib/path";
import { useToastStore } from "@/lib/stores/toastStore";
import { useStaggerOnChange } from "@/lib/animations";
import { useT } from "@/lib/i18n/useT";
import type { PaneEntry } from "@/lib/stores/paneStore";

export interface DragPayload {
  side: "local" | "remote";
  connectionId?: string;
  path: string;
  name: string;
  isDir: boolean;
}

const DND_MIME = "application/x-ferry-entry";

interface PaneStoreState {
  cwd: string;
  entries: PaneEntry[];
  loading: boolean;
  error: string | null;
  selected: Set<string>;
  filter: string;
  setCwd: (cwd: string) => void;
  setEntries: (entries: PaneEntry[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  toggleSelected: (path: string, exclusive?: boolean) => void;
  clearSelection: () => void;
  setFilter: (filter: string) => void;
}

export function FilePane({
  side,
  connectionId,
  transferConnectionId,
  initialPath,
  title,
  store,
  peerStore,
  onPreview,
}: {
  side: "local" | "remote";
  connectionId?: string;
  /** Connection id to use for transfers, always defined regardless of which side this pane is. */
  transferConnectionId?: string;
  initialPath: string;
  title: string;
  store: UseBoundStore<StoreApi<PaneStoreState>>;
  /** The other pane's store, used to know where to save/send files initiated from a context menu (no drag target to read a destination from). */
  peerStore: UseBoundStore<StoreApi<PaneStoreState>>;
  onPreview: (entry: RemoteEntry) => void;
}) {
  const {
    cwd,
    entries,
    loading,
    error,
    selected,
    filter,
    setCwd,
    setEntries,
    setLoading,
    setError,
    toggleSelected,
    clearSelection,
    setFilter,
  } = store();

  const t = useT();
  const pushToast = useToastStore((s) => s.push);
  const listRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; entry?: RemoteEntry } | null>(null);
  const [deleting, setDeleting] = useState<RemoteEntry | null>(null);
  const [renaming, setRenaming] = useState<RemoteEntry | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [searchResults, setSearchResults] = useState<RemoteEntry[] | null>(null);
  const [searching, setSearching] = useState(false);

  useStaggerOnChange(listRef, [entries, filter]);

  useEffect(() => {
    const query = filter.trim();
    if (!query) {
      // Resetting search state when the query is cleared, not syncing from an external source.
      // eslint-disable-next-line react-hooks/set-state-in-effect
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

  async function load(path: string) {
    setLoading(true);
    setError(null);
    try {
      const list = side === "local" ? await localFsApi.listDir(path) : await sftpApi.listDir(connectionId!, path);
      setEntries(list);
      setCwd(path);
      clearSelection();
    } catch (err) {
      setError(String(err));
      pushToast(t("toast.couldntOpen", { path }), "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(initialPath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      load(cwd);
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
      load(cwd);
    } catch (err) {
      pushToast(t("toast.couldntRename", { error: String(err) }), "error");
    }
  }

  async function deleteEntry(entry: RemoteEntry) {
    setDeleting(null);
    try {
      if (side === "local") await localFsApi.remove(entry.path, entry.isDir);
      else await sftpApi.remove(connectionId!, entry.path, entry.isDir);
      load(cwd);
    } catch (err) {
      pushToast(t("toast.couldntDelete", { error: String(err) }), "error");
    }
  }

  async function sendToOtherSide(entry: RemoteEntry) {
    if (entry.isDir) {
      pushToast(t("toast.folderTransferUnsupported"), "info");
      return;
    }
    const destDir = peerStore.getState().cwd;
    try {
      if (side === "local") {
        // this pane is local, so sending to the other side means uploading to remote
        const remoteTarget = joinPath(destDir, entry.name);
        await transfersApi.enqueueUpload(transferConnectionId!, entry.path, remoteTarget);
      } else {
        // this pane is remote, so sending to the other side means downloading to local
        const destination = await saveFileDialog({
          defaultPath: joinPath(destDir, entry.name),
          title: t("filePane.saveAsTitle", { name: entry.name }),
        });
        if (!destination) return;
        await transfersApi.enqueueDownload(transferConnectionId!, entry.path, destination);
      }
    } catch (err) {
      pushToast(t("toast.couldntStartTransfer", { error: String(err) }), "error");
    }
  }

  async function transferEntry(payload: DragPayload) {
    try {
      if (side === "local" && payload.side === "remote") {
        // dropping a remote file onto the local pane -> download
        const localTarget = joinPath(cwd, payload.name);
        await transfersApi.enqueueDownload(payload.connectionId!, payload.path, localTarget);
      } else if (side === "remote" && payload.side === "local") {
        const remoteTarget = joinPath(cwd, payload.name);
        await transfersApi.enqueueUpload(connectionId!, payload.path, remoteTarget);
      }
    } catch (err) {
      pushToast(t("toast.couldntStartTransfer", { error: String(err) }), "error");
    }
  }

  function handleDragStart(e: DragEvent, entry: RemoteEntry) {
    const payload: DragPayload = { side, connectionId, path: entry.path, name: entry.name, isDir: entry.isDir };
    e.dataTransfer.setData(DND_MIME, JSON.stringify(payload));
    e.dataTransfer.effectAllowed = "copy";
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const raw = e.dataTransfer.getData(DND_MIME);
    if (!raw) return;
    const payload: DragPayload = JSON.parse(raw);
    if (payload.side === side) return;
    if (payload.isDir) {
      pushToast(t("toast.folderTransferUnsupported"), "info");
      return;
    }
    void transferEntry(payload);
  }

  const quickFiltered = filter
    ? entries.filter((e) => e.name.toLowerCase().includes(filter.toLowerCase()))
    : entries;
  const filtered = filter ? (searchResults ?? quickFiltered) : entries;
  const isSearching = filter.trim().length > 0 && searchResults !== null;

  function rowMenuItems(entry: RemoteEntry): ContextMenuItem[] {
    return [
      { label: entry.isDir ? t("filePane.open") : t("filePane.preview"), onClick: () => navigate(entry) },
      {
        label: side === "local" ? t("filePane.uploadToRemote") : t("filePane.downloadToLocal"),
        onClick: () => sendToOtherSide(entry),
        disabled: entry.isDir,
        separatorBefore: true,
      },
      { label: t("filePane.rename"), onClick: () => setRenaming(entry) },
      { label: t("filePane.delete"), onClick: () => setDeleting(entry), danger: true },
    ];
  }

  function paneMenuItems(): ContextMenuItem[] {
    return [
      { label: t("filePane.newFolder"), onClick: () => setCreatingFolder(true) },
      { label: t("filePane.refresh"), onClick: () => load(cwd) },
    ];
  }

  return (
    <div
      className={`flex min-w-0 flex-1 flex-col overflow-hidden border-border ${
        side === "local" ? "border-r" : ""
      } ${dragOver ? "bg-accent/5" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
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
            onClick={() => load(cwd)}
            className="rounded-md p-1 text-foreground-muted hover:bg-surface-2 hover:text-foreground"
            title={t("filePane.refresh")}
          >
            <RefreshCw className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <Breadcrumbs path={cwd} onNavigate={load} />
      </div>

      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1.5">
        <Search className="size-3.5 text-foreground-muted" />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t("filePane.searchPlaceholder")}
          className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-foreground-muted"
        />
        {searching && <span className="shrink-0 text-xs text-foreground-muted">{t("filePane.searching")}</span>}
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
        ) : filtered.length === 0 ? (
          <p className="p-3 text-sm text-foreground-muted">{t("filePane.emptyFolder")}</p>
        ) : (
          filtered.map((entry) => {
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
                subPath={subPath}
                onClick={(e) => toggleSelected(entry.path, !(e.metaKey || e.ctrlKey))}
                onDoubleClick={() => navigate(entry)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setMenu({ x: e.clientX, y: e.clientY, entry });
                }}
                onDragStart={(e) => handleDragStart(e, entry)}
              />
            );
          })
        )}
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menu.entry ? rowMenuItems(menu.entry) : paneMenuItems()}
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
