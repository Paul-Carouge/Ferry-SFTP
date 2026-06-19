"use client";

import { useEffect, useState } from "react";
import { FolderTree } from "lucide-react";
import { useConnectionsStore } from "@/lib/stores/connectionsStore";
import { useTransfersStore } from "@/lib/stores/transfersStore";
import { useSettingsStore } from "@/lib/stores/settingsStore";
import { TopBar } from "@/components/layout/TopBar";
import { Sidebar } from "@/components/layout/Sidebar";
import { SplashScreen } from "@/components/layout/SplashScreen";
import { ConnectionStatusBar } from "@/components/connection/ConnectionStatusBar";
import { EmptyState } from "@/components/common/EmptyState";
import { DualPane } from "@/components/browser/DualPane";
import { TransferQueuePanel } from "@/components/transfers/TransferQueuePanel";
import { ToastStack } from "@/components/common/ToastStack";
import { localFsApi } from "@/lib/api";
import { useT } from "@/lib/i18n/useT";

export function AppShell() {
  const t = useT();
  const initConnections = useConnectionsStore((s) => s.init);
  const initTransfers = useTransfersStore((s) => s.init);
  const initSettings = useSettingsStore((s) => s.init);
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
    localFsApi.homeDir().then(setLocalHome).catch(() => {});
  }, [initConnections, initTransfers, initSettings]);

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
          ) : (
            <EmptyState
              icon={<FolderTree className="size-8" />}
              title={t("emptyState.noConnection")}
              description={t("emptyState.noConnectionDesc")}
            />
          )}
        </main>
      </div>
      <TransferQueuePanel />
      <ToastStack />
    </div>
  );
}
