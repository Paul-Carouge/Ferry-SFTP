"use client";

import { useEffect, useRef, useState } from "react";
import { Command, Loader2, Pencil, Plus, Server, Star, Trash2 } from "lucide-react";
import { useConnectionsStore } from "@/lib/stores/connectionsStore";
import { useUiStore } from "@/lib/stores/uiStore";
import { ConnectionDialog } from "@/components/connection/ConnectionDialog";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { fadeInUp, staggerRows } from "@/lib/animations";
import { formatDate } from "@/lib/format";
import { useT } from "@/lib/i18n/useT";
import type { ConnectionProfile } from "@/lib/api";

export function ConnectScreen() {
  const t = useT();
  const profiles = useConnectionsStore((s) => s.profiles);
  const sessions = useConnectionsStore((s) => s.sessions);
  const connectWithProfile = useConnectionsStore((s) => s.connectWithProfile);
  const saveProfile = useConnectionsStore((s) => s.saveProfile);
  const deleteProfile = useConnectionsStore((s) => s.deleteProfile);
  const setActiveSession = useConnectionsStore((s) => s.setActiveSession);
  const setNewConnectionOpen = useUiStore((s) => s.setNewConnectionOpen);

  const [editing, setEditing] = useState<ConnectionProfile | null>(null);
  const [deleting, setDeleting] = useState<ConnectionProfile | null>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);

  const heroRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (heroRef.current) fadeInUp(heroRef.current);
    if (gridRef.current) staggerRows(gridRef.current);
  }, [profiles.length]);

  function sessionFor(profile: ConnectionProfile) {
    return sessions.find((s) => s.profileId === profile.id) ?? null;
  }

  async function connect(profile: ConnectionProfile) {
    const existing = sessionFor(profile);
    if (existing) {
      setActiveSession(existing.id);
      return;
    }
    setConnectingId(profile.id);
    try {
      await connectWithProfile(profile);
    } catch {
      // surfaced through the connection status bar
    } finally {
      setConnectingId(null);
    }
  }

  const favorites = profiles.filter((p) => p.favorite);
  const recent = profiles
    .filter((p) => !p.favorite && p.lastConnectedAt)
    .sort((a, b) => (b.lastConnectedAt ?? 0) - (a.lastConnectedAt ?? 0))
    .slice(0, 6);
  const others = profiles
    .filter((p) => !p.favorite && !recent.includes(p))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-4xl flex-col px-8 py-12">
        <div ref={heroRef} className="flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.png" alt="" className="size-16 rounded-[22%] shadow-lg" />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">Ferry</h1>
          <p className="mt-1.5 max-w-sm text-sm text-foreground-muted">{t("connectScreen.tagline")}</p>

          <div className="mt-6 flex items-center gap-3">
            <button
              onClick={() => setNewConnectionOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground shadow-sm transition-colors hover:bg-accent-hover"
            >
              <Plus className="size-4" />
              {t("sidebar.newConnection")}
            </button>
            <span className="hidden items-center gap-1.5 text-xs text-foreground-muted sm:flex">
              <kbd className="inline-flex items-center gap-0.5 rounded-md border border-border bg-surface-1 px-1.5 py-0.5 font-sans">
                <Command className="size-3" />K
              </kbd>
              {t("connectScreen.paletteHint")}
            </span>
          </div>
        </div>

        {profiles.length === 0 ? (
          <div className="mt-14 flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-surface-0/40 px-8 py-14 text-center">
            <Server className="size-7 text-foreground-muted" />
            <p className="text-sm font-medium text-foreground">{t("sidebar.noConnections")}</p>
            <p className="max-w-xs text-sm text-foreground-muted">{t("sidebar.noConnectionsDesc")}</p>
          </div>
        ) : (
          <div ref={gridRef} className="mt-12 flex flex-col gap-8">
            {favorites.length > 0 && (
              <CardSection title={t("sidebar.favorites")}>
                {favorites.map((p) => (
                  <ConnectionCard
                    key={p.id}
                    profile={p}
                    connecting={connectingId === p.id}
                    activeSession={!!sessionFor(p)}
                    onConnect={() => connect(p)}
                    onEdit={() => setEditing(p)}
                    onDelete={() => setDeleting(p)}
                    onToggleFavorite={() => saveProfile({ ...p, favorite: !p.favorite })}
                    lastConnectedLabel={lastConnectedLabel(t, p.lastConnectedAt)}
                  />
                ))}
              </CardSection>
            )}

            {recent.length > 0 && (
              <CardSection title={t("sidebar.recent")}>
                {recent.map((p) => (
                  <ConnectionCard
                    key={p.id}
                    profile={p}
                    connecting={connectingId === p.id}
                    activeSession={!!sessionFor(p)}
                    onConnect={() => connect(p)}
                    onEdit={() => setEditing(p)}
                    onDelete={() => setDeleting(p)}
                    onToggleFavorite={() => saveProfile({ ...p, favorite: !p.favorite })}
                    lastConnectedLabel={lastConnectedLabel(t, p.lastConnectedAt)}
                  />
                ))}
              </CardSection>
            )}

            {others.length > 0 && (
              <CardSection title={t("sidebar.allConnections")}>
                {others.map((p) => (
                  <ConnectionCard
                    key={p.id}
                    profile={p}
                    connecting={connectingId === p.id}
                    activeSession={!!sessionFor(p)}
                    onConnect={() => connect(p)}
                    onEdit={() => setEditing(p)}
                    onDelete={() => setDeleting(p)}
                    onToggleFavorite={() => saveProfile({ ...p, favorite: !p.favorite })}
                    lastConnectedLabel={lastConnectedLabel(t, p.lastConnectedAt)}
                  />
                ))}
              </CardSection>
            )}
          </div>
        )}
      </div>

      <ConnectionDialog open={editing !== null} onClose={() => setEditing(null)} editingProfile={editing} />

      <ConfirmDialog
        open={deleting !== null}
        title={t("sidebar.deleteTitle", { name: deleting?.name ?? "" })}
        description={t("sidebar.deleteDesc")}
        confirmLabel={t("connItem.delete")}
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) deleteProfile(deleting.id);
          setDeleting(null);
        }}
      />
    </div>
  );
}

function lastConnectedLabel(t: ReturnType<typeof useT>, at: number | null | undefined) {
  if (!at) return t("connectScreen.neverConnected");
  return t("connectScreen.lastConnected", { when: formatDate(at) });
}

function CardSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-foreground-muted">{title}</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );
}

function ConnectionCard({
  profile,
  connecting,
  activeSession,
  onConnect,
  onEdit,
  onDelete,
  onToggleFavorite,
  lastConnectedLabel,
}: {
  profile: ConnectionProfile;
  connecting: boolean;
  activeSession: boolean;
  onConnect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
  lastConnectedLabel: string;
}) {
  const t = useT();
  const color = profile.color ?? "#6366f1";

  function action(e: React.MouseEvent, fn: () => void) {
    e.stopPropagation();
    fn();
  }

  return (
    <button
      onClick={onConnect}
      disabled={connecting}
      title={t("connItem.connect")}
      className="group relative flex flex-col gap-3 overflow-hidden rounded-xl border border-border bg-surface-1 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-md disabled:cursor-wait"
    >
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: color }} />

      <div className="flex items-start justify-between gap-2 pl-1.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-lg"
            style={{ background: `${color}1a`, color }}
          >
            <Server className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground">
              {profile.name}
              {activeSession && <span className="size-1.5 shrink-0 rounded-full bg-success" />}
            </p>
            <p className="truncate text-xs text-foreground-muted">
              {profile.username}@{profile.host}:{profile.port}
            </p>
          </div>
        </div>
        {connecting && <Loader2 className="size-4 shrink-0 animate-spin text-accent" />}
      </div>

      <div className="flex items-center justify-between pl-1.5">
        <span className="truncate text-[11px] text-foreground-muted">{lastConnectedLabel}</span>
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <span
            role="button"
            tabIndex={-1}
            onClick={(e) => action(e, onToggleFavorite)}
            title={t(profile.favorite ? "connItem.unfavorite" : "connItem.favorite")}
            className="rounded-md p-1 text-foreground-muted hover:bg-surface-2 hover:text-foreground"
          >
            <Star className={`size-3.5 ${profile.favorite ? "fill-warning text-warning" : ""}`} />
          </span>
          <span
            role="button"
            tabIndex={-1}
            onClick={(e) => action(e, onEdit)}
            title={t("connItem.edit")}
            className="rounded-md p-1 text-foreground-muted hover:bg-surface-2 hover:text-foreground"
          >
            <Pencil className="size-3.5" />
          </span>
          <span
            role="button"
            tabIndex={-1}
            onClick={(e) => action(e, onDelete)}
            title={t("connItem.delete")}
            className="rounded-md p-1 text-foreground-muted hover:bg-danger/10 hover:text-danger"
          >
            <Trash2 className="size-3.5" />
          </span>
        </div>
      </div>
    </button>
  );
}
