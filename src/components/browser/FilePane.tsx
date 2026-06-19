"use client";

import { useEffect, useRef, useState, type DragEvent, type MouseEvent } from "react";
import type { StoreApi, UseBoundStore } from "zustand";
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
  initialPath,
  title,
  store,
  onPreview,
}: {
  side: "local" | "remote";
  connectionId?: string;
  initialPath: string;
  title: string;
  store: UseBoundStore<StoreApi<PaneStoreState>>;
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
        pushToast(`Search failed: ${err}`, "error");
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
      pushToast(`Couldn't open ${path}`, "error");
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
      pushToast(`Couldn't create folder: ${err}`, "error");
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
      pushToast(`Couldn't rename: ${err}`, "error");
    }
  }

  async function deleteEntry(entry: RemoteEntry) {
    setDeleting(null);
    try {
      if (side === "local") await localFsApi.remove(entry.path, entry.isDir);
      else await sftpApi.remove(connectionId!, entry.path, entry.isDir);
      load(cwd);
    } catch (err) {
      pushToast(`Couldn't delete: ${err}`, "error");
    }
  }

  function sendToOtherSide(entry: RemoteEntry) {
    if (entry.isDir) {
      pushToast("Folder transfers aren't supported yet — only files.", "info");
      return;
    }
    void transferEntry({ side, connectionId, path: entry.path, name: entry.name, isDir: entry.isDir });
  }

  async function transferEntry(payload: DragPayload) {
    try {
      if (side === "local" && payload.side === "remote") {
        // dropping a remote file onto the local pane -> download
        const localTarget = joinPath(cwd, payload.name);
        await transfersApi.enqueueDownload(payload.connectionId!, payload.path, localTarget);
        pushToast(`Downloading ${payload.name}`, "success");
      } else if (side === "remote" && payload.side === "local") {
        const remoteTarget = joinPath(cwd, payload.name);
        await transfersApi.enqueueUpload(connectionId!, payload.path, remoteTarget);
        pushToast(`Uploading ${payload.name}`, "success");
      }
    } catch (err) {
      pushToast(`Transfer failed: ${err}`, "error");
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
      pushToast("Folder transfers aren't supported yet — only files.", "info");
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
      { label: entry.isDir ? "Open" : "Preview", onClick: () => navigate(entry) },
      {
        label: side === "local" ? "Upload to remote" : "Download to local",
        onClick: () => sendToOtherSide(entry),
        disabled: entry.isDir,
        separatorBefore: true,
      },
      { label: "Rename", onClick: () => setRenaming(entry) },
      { label: "Delete", onClick: () => setDeleting(entry), danger: true },
    ];
  }

  function paneMenuItems(): ContextMenuItem[] {
    return [
      { label: "New folder", onClick: () => setCreatingFolder(true) },
      { label: "Refresh", onClick: () => load(cwd) },
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
            title="New folder"
          >
            <FolderPlus className="size-3.5" />
          </button>
          <button
            onClick={() => load(cwd)}
            className="rounded-md p-1 text-foreground-muted hover:bg-surface-2 hover:text-foreground"
            title="Refresh"
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
          placeholder="Search files and subfolders…"
          className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-foreground-muted"
        />
        {searching && <span className="shrink-0 text-xs text-foreground-muted">Searching…</span>}
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
          <p className="p-3 text-sm text-foreground-muted">Loading…</p>
        ) : error ? (
          <p className="p-3 text-sm text-danger">{error}</p>
        ) : filtered.length === 0 ? (
          <p className="p-3 text-sm text-foreground-muted">Empty folder</p>
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
        title={`Delete "${deleting?.name}"?`}
        description={deleting?.isDir ? "This deletes the folder and everything inside it." : undefined}
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && deleteEntry(deleting)}
      />

      <PromptDialog
        open={renaming !== null}
        title="Rename"
        label="New name"
        initialValue={renaming?.name ?? ""}
        confirmLabel="Rename"
        onCancel={() => setRenaming(null)}
        onSubmit={(value) => renaming && renameEntry(renaming, value)}
      />

      <PromptDialog
        open={creatingFolder}
        title="New folder"
        label="Folder name"
        confirmLabel="Create"
        onCancel={() => setCreatingFolder(false)}
        onSubmit={createFolder}
      />
    </div>
  );
}
