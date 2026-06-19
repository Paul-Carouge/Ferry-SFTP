"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { ContextMenu, type ContextMenuItem } from "@/components/common/ContextMenu";
import type { ConnectionProfile } from "@/lib/api";
import { useT } from "@/lib/i18n/useT";

export function ConnectionListItem({
  profile,
  active,
  onConnect,
  onEdit,
  onDelete,
  onToggleFavorite,
}: {
  profile: ConnectionProfile;
  active: boolean;
  onConnect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
}) {
  const t = useT();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const items: ContextMenuItem[] = [
    { label: t("connItem.connect"), onClick: onConnect },
    { label: t(profile.favorite ? "connItem.unfavorite" : "connItem.favorite"), onClick: onToggleFavorite },
    { label: t("connItem.edit"), onClick: onEdit, separatorBefore: true },
    { label: t("connItem.delete"), onClick: onDelete, danger: true },
  ];

  return (
    <>
      <button
        onClick={onConnect}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
        className={`group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors ${
          active ? "bg-accent/10 text-foreground" : "text-foreground-muted hover:bg-surface-2 hover:text-foreground"
        }`}
      >
        <span
          className="size-2 shrink-0 rounded-full"
          style={{ background: profile.color ?? "#6366f1" }}
        />
        <span className="flex-1 truncate text-sm">{profile.name}</span>
        {profile.favorite && <Star className="size-3 shrink-0 fill-warning text-warning" />}
      </button>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={items} onClose={() => setMenu(null)} />}
    </>
  );
}
