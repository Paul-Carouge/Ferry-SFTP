"use client";

import { useConnectionsStore } from "@/lib/stores/connectionsStore";
import { useT } from "@/lib/i18n/useT";
import type { TranslationKey } from "@/lib/i18n/translations";

const STATUS_KEY: Record<string, TranslationKey> = {
  connecting: "statusBar.connecting",
  connected: "statusBar.connected",
  error: "statusBar.error",
  disconnected: "statusBar.disconnected",
};

export function ConnectionStatusBar() {
  const t = useT();
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
        {t(STATUS_KEY[session.status])}
        {session.errorMessage ? `: ${session.errorMessage}` : ""}
      </span>
    </div>
  );
}
