"use client";

import { useConnectionsStore } from "@/lib/stores/connectionsStore";

const STATUS_LABEL: Record<string, string> = {
  connecting: "Connecting…",
  connected: "Connected",
  error: "Connection failed",
  disconnected: "Disconnected",
};

export function ConnectionStatusBar() {
  const sessions = useConnectionsStore((s) => s.sessions);
  const activeSessionId = useConnectionsStore((s) => s.activeSessionId);
  const session = sessions.find((s) => s.id === activeSessionId);

  if (!session) return null;

  return (
    <div className="flex h-7 shrink-0 items-center gap-2 border-b border-border bg-surface-0 px-3 text-xs text-foreground-muted">
      <span>
        {session.username}@{session.host}:{session.port}
      </span>
      <span className="text-border">•</span>
      <span className={session.status === "error" ? "text-danger" : ""}>
        {STATUS_LABEL[session.status]}
        {session.errorMessage ? `: ${session.errorMessage}` : ""}
      </span>
    </div>
  );
}
