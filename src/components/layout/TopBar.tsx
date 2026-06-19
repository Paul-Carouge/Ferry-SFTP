"use client";

import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Copy, Minus, Plus, Settings, Square, X } from "lucide-react";
import { useConnectionsStore } from "@/lib/stores/connectionsStore";
import { ConnectionDialog } from "@/components/connection/ConnectionDialog";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { SettingsDialog } from "@/components/settings/SettingsDialog";
import { useT } from "@/lib/i18n/useT";

const STATUS_DOT: Record<string, string> = {
  connecting: "bg-warning animate-pulse",
  connected: "bg-success",
  error: "bg-danger",
  disconnected: "bg-foreground-muted",
};

export function TopBar() {
  const t = useT();
  const sessions = useConnectionsStore((s) => s.sessions);
  const activeSessionId = useConnectionsStore((s) => s.activeSessionId);
  const setActiveSession = useConnectionsStore((s) => s.setActiveSession);
  const disconnectSession = useConnectionsStore((s) => s.disconnectSession);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const appWindow = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    appWindow.isMaximized().then(setIsMaximized);
    appWindow.onResized(() => {
      appWindow.isMaximized().then(setIsMaximized);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  return (
    <div
      data-tauri-drag-region
      className="flex h-11 shrink-0 items-center gap-1 border-b border-border bg-surface-0 pl-2"
      onDoubleClick={() => getCurrentWindow().toggleMaximize()}
    >
      <span className="flex items-center gap-1.5 px-2 text-sm font-semibold text-foreground">
        <svg viewBox="0 0 24 24" className="size-3.5 text-accent" fill="currentColor">
          <path d="M3 15.5 12 18l9-2.5-1.5 3.3Q12 20 3 18.8Z" />
          <path d="M9 11h6v3H9zM11.2 5h1.6v5.2h-1.6z" />
        </svg>
        Ferry
      </span>
      <div data-tauri-drag-region className="flex flex-1 items-center gap-1 overflow-x-auto px-1">
        {sessions.map((session) => (
          <button
            key={session.id}
            onClick={() => setActiveSession(session.id)}
            className={`group flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors ${
              session.id === activeSessionId
                ? "bg-surface-2 text-foreground"
                : "text-foreground-muted hover:bg-surface-2/60 hover:text-foreground"
            }`}
          >
            <span className={`size-1.5 rounded-full ${STATUS_DOT[session.status]}`} />
            <span className="max-w-[140px] truncate">{session.label}</span>
            <X
              className="size-3 opacity-0 transition-opacity group-hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                disconnectSession(session.id);
              }}
            />
          </button>
        ))}
        <button
          onClick={() => setDialogOpen(true)}
          className="rounded-md p-1.5 text-foreground-muted hover:bg-surface-2 hover:text-foreground"
          title={t("topBar.newConnection")}
        >
          <Plus className="size-4" />
        </button>
      </div>
      <ThemeToggle />
      <button
        onClick={() => setSettingsOpen(true)}
        className="rounded-md p-1.5 text-foreground-muted hover:bg-surface-2 hover:text-foreground"
        title={t("topBar.settings")}
      >
        <Settings className="size-4" />
      </button>

      <div className="ml-1 flex h-full items-center">
        <button
          onClick={() => getCurrentWindow().minimize()}
          className="flex h-full w-10 items-center justify-center text-foreground-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          title={t("topBar.minimize")}
        >
          <Minus className="size-4" />
        </button>
        <button
          onClick={() => getCurrentWindow().toggleMaximize()}
          className="flex h-full w-10 items-center justify-center text-foreground-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          title={isMaximized ? t("topBar.restore") : t("topBar.maximize")}
        >
          {isMaximized ? <Copy className="size-3.5" /> : <Square className="size-3.5" />}
        </button>
        <button
          onClick={() => getCurrentWindow().close()}
          className="flex h-full w-10 items-center justify-center text-foreground-muted transition-colors hover:bg-danger hover:text-white"
          title={t("topBar.close")}
        >
          <X className="size-4" />
        </button>
      </div>

      <ConnectionDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
