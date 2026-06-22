"use client";

/* Resetting query/active state when the palette opens or its filtered list shrinks is
   intentional effect-driven state; react-hooks/set-state-in-effect is disabled for it. */
/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Cable,
  Check,
  Eye,
  Bell,
  Moon,
  Plug,
  PlugZap,
  Plus,
  RefreshCw,
  Settings as SettingsIcon,
} from "lucide-react";
import { Bookmark as BookmarkIcon } from "lucide-react";
import { useUiStore } from "@/lib/stores/uiStore";
import { useConnectionsStore } from "@/lib/stores/connectionsStore";
import { useSettingsStore } from "@/lib/stores/settingsStore";
import { useBookmarksStore } from "@/lib/stores/bookmarksStore";
import { useLocalPaneStore } from "@/lib/stores/paneStore";
import { useUpdateStore } from "@/lib/stores/updateStore";
import { useT } from "@/lib/i18n/useT";
import type { ReactNode } from "react";

interface Command {
  id: string;
  label: string;
  section: string;
  keywords: string;
  icon: ReactNode;
  run: () => void;
}

export function CommandPalette() {
  const t = useT();
  const open = useUiStore((s) => s.paletteOpen);
  const setOpen = useUiStore((s) => s.setPaletteOpen);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);
  const setNewConnectionOpen = useUiStore((s) => s.setNewConnectionOpen);
  const toggleTheme = useUiStore((s) => s.toggleTheme);

  const profiles = useConnectionsStore((s) => s.profiles);
  const sessions = useConnectionsStore((s) => s.sessions);
  const activeSessionId = useConnectionsStore((s) => s.activeSessionId);
  const connectWithProfile = useConnectionsStore((s) => s.connectWithProfile);
  const setActiveSession = useConnectionsStore((s) => s.setActiveSession);
  const disconnectSession = useConnectionsStore((s) => s.disconnectSession);

  const showHiddenFiles = useSettingsStore((s) => s.showHiddenFiles);
  const setShowHiddenFiles = useSettingsStore((s) => s.setShowHiddenFiles);
  const showTransferToasts = useSettingsStore((s) => s.showTransferToasts);
  const setShowTransferToasts = useSettingsStore((s) => s.setShowTransferToasts);
  const checkForUpdates = useUpdateStore((s) => s.checkNow);
  const bookmarks = useBookmarksStore((s) => s.bookmarks);

  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const commands = useMemo<Command[]>(() => {
    const cmds: Command[] = [];

    for (const p of profiles) {
      cmds.push({
        id: `connect:${p.id}`,
        section: t("palette.sectionConnections"),
        label: t("palette.connectTo", { name: p.name }),
        keywords: `${p.name} ${p.host} ${p.username} connect`,
        icon: <Cable className="size-4 shrink-0 text-foreground-muted" />,
        run: () => void connectWithProfile(p),
      });
    }

    for (const sess of sessions) {
      if (sess.id === activeSessionId) continue;
      cmds.push({
        id: `session:${sess.id}`,
        section: t("palette.sectionSessions"),
        label: t("palette.switchTo", { name: sess.label }),
        keywords: `${sess.label} ${sess.host} switch session tab`,
        icon: <Plug className="size-4 shrink-0 text-foreground-muted" />,
        run: () => setActiveSession(sess.id),
      });
    }

    // Local bookmarks jump the local pane; remote bookmarks are reached from
    // each pane's own bookmark menu (the active remote store isn't global).
    for (const b of bookmarks.filter((bk) => bk.side === "local")) {
      cmds.push({
        id: `bookmark:${b.id}`,
        section: t("palette.sectionBookmarks"),
        label: t("palette.goToBookmark", { name: b.label }),
        keywords: `${b.label} ${b.path} bookmark go`,
        icon: <BookmarkIcon className="size-4 shrink-0 text-foreground-muted" />,
        run: () => useLocalPaneStore.getState().requestNavigate(b.path),
      });
    }

    const action = (id: string, label: string, keywords: string, icon: ReactNode, run: () => void) =>
      cmds.push({ id, section: t("palette.sectionActions"), label, keywords, icon, run });

    if (activeSessionId) {
      action(
        "disconnect",
        t("palette.disconnect"),
        "disconnect close session",
        <PlugZap className="size-4 shrink-0 text-foreground-muted" />,
        () => void disconnectSession(activeSessionId),
      );
    }
    action(
      "new-connection",
      t("palette.newConnection"),
      "new connection add server",
      <Plus className="size-4 shrink-0 text-foreground-muted" />,
      () => setNewConnectionOpen(true),
    );
    action(
      "theme",
      t("palette.toggleTheme"),
      "theme dark light mode appearance",
      <Moon className="size-4 shrink-0 text-foreground-muted" />,
      toggleTheme,
    );
    action(
      "hidden",
      t("palette.toggleHidden"),
      "hidden dotfiles show",
      showHiddenFiles ? <Check className="size-4 shrink-0 text-accent" /> : <Eye className="size-4 shrink-0 text-foreground-muted" />,
      () => setShowHiddenFiles(!showHiddenFiles),
    );
    action(
      "toasts",
      t("palette.toggleToasts"),
      "notifications toasts transfer",
      showTransferToasts ? <Check className="size-4 shrink-0 text-accent" /> : <Bell className="size-4 shrink-0 text-foreground-muted" />,
      () => setShowTransferToasts(!showTransferToasts),
    );
    action(
      "settings",
      t("palette.openSettings"),
      "settings preferences options",
      <SettingsIcon className="size-4 shrink-0 text-foreground-muted" />,
      () => setSettingsOpen(true),
    );
    action(
      "updates",
      t("palette.checkUpdates"),
      "update version check",
      <RefreshCw className="size-4 shrink-0 text-foreground-muted" />,
      () => void checkForUpdates(),
    );

    return cmds;
  }, [
    profiles,
    sessions,
    activeSessionId,
    bookmarks,
    showHiddenFiles,
    showTransferToasts,
    connectWithProfile,
    setActiveSession,
    disconnectSession,
    setNewConnectionOpen,
    toggleTheme,
    setShowHiddenFiles,
    setShowTransferToasts,
    setSettingsOpen,
    checkForUpdates,
    t,
  ]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    const terms = q.split(/\s+/);
    return commands.filter((c) => {
      const hay = `${c.label} ${c.keywords}`.toLowerCase();
      return terms.every((term) => hay.includes(term));
    });
  }, [commands, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
    }
  }, [open]);

  useEffect(() => {
    if (active >= filtered.length) setActive(filtered.length === 0 ? 0 : filtered.length - 1);
  }, [filtered, active]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  function runAt(index: number) {
    const cmd = filtered[index];
    if (!cmd) return;
    setOpen(false);
    cmd.run();
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[12vh]" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div
        className="relative z-10 w-full max-w-lg overflow-hidden rounded-xl border border-border bg-surface-1 shadow-2xl"
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(filtered.length - 1, i + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(0, i - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            runAt(active);
          } else if (e.key === "Escape") {
            e.preventDefault();
            setOpen(false);
          }
        }}
      >
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          placeholder={t("palette.placeholder")}
          className="w-full border-b border-border bg-transparent px-4 py-3 text-sm text-foreground outline-none placeholder:text-foreground-muted"
        />
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-1.5">
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-foreground-muted">{t("palette.empty")}</p>
          ) : (
            filtered.map((cmd, i) => {
              const prevSection = i > 0 ? filtered[i - 1].section : null;
              return (
                <div key={cmd.id}>
                  {cmd.section !== prevSection && (
                    <div className="px-2.5 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-foreground-muted">
                      {cmd.section}
                    </div>
                  )}
                  <button
                    data-active={i === active}
                    onMouseMove={() => setActive(i)}
                    onClick={() => runAt(i)}
                    className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors ${
                      i === active ? "bg-accent/15 text-foreground" : "text-foreground hover:bg-surface-2"
                    }`}
                  >
                    {cmd.icon}
                    <span className="truncate">{cmd.label}</span>
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
