"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

export interface ContextMenuItem {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  separatorBefore?: boolean;
}

export function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const clampedX = Math.min(x, window.innerWidth - 220);
  const clampedY = Math.min(y, window.innerHeight - items.length * 32 - 16);

  return (
    <div
      ref={ref}
      style={{ left: clampedX, top: clampedY }}
      className="fixed z-50 min-w-[180px] rounded-lg border border-border bg-surface-1 p-1 shadow-2xl"
    >
      {items.map((item, i) => (
        <div key={i}>
          {item.separatorBefore && <div className="my-1 h-px bg-border" />}
          <button
            disabled={item.disabled}
            onClick={() => {
              onClose();
              item.onClick();
            }}
            className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors disabled:opacity-40 ${
              item.danger
                ? "text-danger hover:bg-danger/10"
                : "text-foreground hover:bg-surface-2"
            }`}
          >
            {item.icon}
            {item.label}
          </button>
        </div>
      ))}
    </div>
  );
}
