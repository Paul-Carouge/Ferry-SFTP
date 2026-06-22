"use client";

import { useEffect, useState } from "react";
import { useConnectionsStore } from "@/lib/stores/connectionsStore";
import { useTransfersStore } from "@/lib/stores/transfersStore";
import { useSettingsStore } from "@/lib/stores/settingsStore";
import { useUpdateStore } from "@/lib/stores/updateStore";
import { useUiStore } from "@/lib/stores/uiStore";
import { useEditWatchStore } from "@/lib/stores/editWatchStore";
import { useBookmarksStore } from "@/lib/stores/bookmarksStore";
import { TopBar } from "@/components/layout/TopBar";
import { Sidebar } from "@/components/layout/Sidebar";
import { SplashScreen } from "@/components/layout/SplashScreen";
import { ConnectionStatusBar } from "@/components/connection/ConnectionStatusBar";
import { HostKeyTrustDialog } from "@/components/connection/HostKeyTrustDialog";
import { ConnectScreen } from "@/components/connection/ConnectScreen";
import { ConnectingScreen } from "@/components/connection/ConnectingScreen";
import { DualPane } from "@/components/browser/DualPane";
import { TransferQueuePanel } from "@/components/transfers/TransferQueuePanel";
import { ToastStack } from "@/components/common/ToastStack";
import { CommandPalette } from "@/components/common/CommandPalette";
import { localFsApi } from "@/lib/api";

export function AppShell() {
  const initConnections = useConnectionsStore((s) => s.init);
  const initTransfers = useTransfersStore((s) => s.init);
  const initSettings = useSettingsStore((s) => s.init);
  const initEditWatch = useEditWatchStore((s) => s.init);
  const initUi = useUiStore((s) => s.init);
  const initBookmarks = useBookmarksStore((s) => s.init);
  const togglePalette = useUiStore((s) => s.togglePalette);
  const checkForUpdateSilently = useUpdateStore((s) => s.checkSilently);
  const activeSessionId = useConnectionsStore((s) => s.activeSessionId);
  const session = useConnectionsStore((s) =>
    s.sessions.find((sess) => sess.id === activeSessionId),
  );
  const [localHome, setLocalHome] = useState("/");
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    initConnections();
    initTransfers();
    initSettings();
    initEditWatch();
    initUi();
    initBookmarks();
    checkForUpdateSilently();
    localFsApi.homeDir().then(setLocalHome).catch(() => {});
  }, [initConnections, initTransfers, initSettings, initEditWatch, initUi, initBookmarks, checkForUpdateSilently]);

  // Global Cmd/Ctrl+K toggles the command palette.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        togglePalette();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePalette]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      {showSplash && <SplashScreen onDone={() => setShowSplash(false)} />}
      <TopBar />
      <ConnectionStatusBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex flex-1 flex-col overflow-hidden">
          {session && session.status === "connected" ? (
            <DualPane key={session.id} session={session} localHome={localHome} />
          ) : session && session.status === "connecting" ? (
            <ConnectingScreen session={session} />
          ) : (
            <ConnectScreen />
          )}
        </main>
      </div>
      <TransferQueuePanel />
      <HostKeyTrustDialog />
      <CommandPalette />
      <ToastStack />
    </div>
  );
}
