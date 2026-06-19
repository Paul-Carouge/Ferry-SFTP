"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Server } from "lucide-react";
import { useConnectionsStore } from "@/lib/stores/connectionsStore";
import { ConnectionListItem } from "@/components/connection/ConnectionListItem";
import { ConnectionDialog } from "@/components/connection/ConnectionDialog";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { EmptyState } from "@/components/common/EmptyState";
import { slideInFromLeft } from "@/lib/animations";
import type { ConnectionProfile } from "@/lib/api";
import { useT } from "@/lib/i18n/useT";

export function Sidebar() {
  const t = useT();
  const profiles = useConnectionsStore((s) => s.profiles);
  const sessions = useConnectionsStore((s) => s.sessions);
  const activeSessionId = useConnectionsStore((s) => s.activeSessionId);
  const setActiveSession = useConnectionsStore((s) => s.setActiveSession);
  const connectWithProfile = useConnectionsStore((s) => s.connectWithProfile);
  const saveProfile = useConnectionsStore((s) => s.saveProfile);
  const deleteProfile = useConnectionsStore((s) => s.deleteProfile);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<ConnectionProfile | null>(null);
  const [deletingProfile, setDeletingProfile] = useState<ConnectionProfile | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (rootRef.current) slideInFromLeft(rootRef.current);
  }, []);

  const favorites = profiles.filter((p) => p.favorite);
  const recent = profiles
    .filter((p) => !p.favorite && p.lastConnectedAt)
    .sort((a, b) => (b.lastConnectedAt ?? 0) - (a.lastConnectedAt ?? 0))
    .slice(0, 8);

  function activeProfileId(profile: ConnectionProfile) {
    return sessions.find((s) => s.profileId === profile.id)?.id ?? null;
  }

  async function handleConnect(profile: ConnectionProfile) {
    const existing = activeProfileId(profile);
    if (existing) {
      setActiveSession(existing);
      return;
    }
    try {
      await connectWithProfile(profile);
    } catch {
      // surfaced via session status in the top bar
    }
  }

  return (
    <div
      ref={rootRef}
      className="flex w-60 shrink-0 flex-col border-r border-border bg-surface-0 p-3"
    >
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
          {t("sidebar.connections")}
        </span>
        <button
          onClick={() => {
            setEditingProfile(null);
            setDialogOpen(true);
          }}
          className="rounded-md p-1 text-foreground-muted hover:bg-surface-2 hover:text-foreground"
          title={t("sidebar.newConnection")}
        >
          <Plus className="size-4" />
        </button>
      </div>

      {profiles.length === 0 ? (
        <EmptyState
          icon={<Server className="size-6" />}
          title={t("sidebar.noConnections")}
          description={t("sidebar.noConnectionsDesc")}
        />
      ) : (
        <div className="flex flex-col gap-3 overflow-y-auto">
          {favorites.length > 0 && (
            <Section title={t("sidebar.favorites")}>
              {favorites.map((p) => (
                <ConnectionListItem
                  key={p.id}
                  profile={p}
                  active={activeProfileId(p) === activeSessionId}
                  onConnect={() => handleConnect(p)}
                  onEdit={() => {
                    setEditingProfile(p);
                    setDialogOpen(true);
                  }}
                  onDelete={() => setDeletingProfile(p)}
                  onToggleFavorite={() => saveProfile({ ...p, favorite: !p.favorite })}
                />
              ))}
            </Section>
          )}

          {recent.length > 0 && (
            <Section title={t("sidebar.recent")}>
              {recent.map((p) => (
                <ConnectionListItem
                  key={p.id}
                  profile={p}
                  active={activeProfileId(p) === activeSessionId}
                  onConnect={() => handleConnect(p)}
                  onEdit={() => {
                    setEditingProfile(p);
                    setDialogOpen(true);
                  }}
                  onDelete={() => setDeletingProfile(p)}
                  onToggleFavorite={() => saveProfile({ ...p, favorite: !p.favorite })}
                />
              ))}
            </Section>
          )}

          <Section title={t("sidebar.allConnections")}>
            {profiles
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((p) => (
                <ConnectionListItem
                  key={p.id}
                  profile={p}
                  active={activeProfileId(p) === activeSessionId}
                  onConnect={() => handleConnect(p)}
                  onEdit={() => {
                    setEditingProfile(p);
                    setDialogOpen(true);
                  }}
                  onDelete={() => setDeletingProfile(p)}
                  onToggleFavorite={() => saveProfile({ ...p, favorite: !p.favorite })}
                />
              ))}
          </Section>
        </div>
      )}

      <ConnectionDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        editingProfile={editingProfile}
      />

      <ConfirmDialog
        open={deletingProfile !== null}
        title={t("sidebar.deleteTitle", { name: deletingProfile?.name ?? "" })}
        description={t("sidebar.deleteDesc")}
        confirmLabel={t("connItem.delete")}
        danger
        onCancel={() => setDeletingProfile(null)}
        onConfirm={() => {
          if (deletingProfile) deleteProfile(deletingProfile.id);
          setDeletingProfile(null);
        }}
      />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-foreground-muted/70">
        {title}
      </p>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}
