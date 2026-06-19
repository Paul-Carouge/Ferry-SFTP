"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { scaleIn } from "@/lib/animations";

export function Modal({
  open,
  onClose,
  children,
  width = "max-w-md",
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  width?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && panelRef.current) scaleIn(panelRef.current);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className={`w-full ${width} rounded-xl border border-border bg-surface-1 p-5 shadow-2xl`}
      >
        {children}
      </div>
    </div>
  );
}
