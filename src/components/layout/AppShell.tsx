"use client";

import { useEffect, useState } from "react";
import { FolderTree } from "lucide-react";
import { useConnectionsStore } from "@/lib/stores/connectionsStore";
import { useTransfersStore } from "@/lib/stores/transfersStore";
import { TopBar } from "@/components/layout/TopBar";
import { Sidebar } from "@/components/layout/Sidebar";
import { ConnectionStatusBar } from "@/components/connection/ConnectionStatusBar";
import { EmptyState } from "@/components/common/EmptyState";
import { DualPane } from "@/components/browser/DualPane";
import { TransferQueuePanel } from "@/components/transfers/TransferQueuePanel";
import { ToastStack } from "@/components/common/ToastStack";
import { localFsApi } from "@/lib/api";

export function AppShell() {
  const initConnections = useConnectionsStore((s) => s.init);
  const initTransfers = useTransfersStore((s) => s.init);
  const activeSessionId = useConnectionsStore((s) => s.activeSessionId);
  const session = useConnectionsStore((s) =>
    s.sessions.find((sess) => sess.id === activeSessionId),
  );
  const [localHome, setLocalHome] = useState("/");

  useEffect(() => {
    initConnections();
    initTransfers();
    localFsApi.homeDir().then(setLocalHome).catch(() => {});
  }, [initConnections, initTransfers]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
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
              title="No active connection"
              description="Connect to a server from the sidebar to start browsing files."
            />
          )}
        </main>
      </div>
      <TransferQueuePanel />
      <ToastStack />
    </div>
  );
}
