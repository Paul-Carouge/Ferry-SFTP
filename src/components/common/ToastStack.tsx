"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useToastStore } from "@/lib/stores/toastStore";
import { slideUpFromBottom } from "@/lib/animations";

const VARIANT_CLASSES = {
  info: "border-border bg-surface-1",
  error: "border-danger/30 bg-surface-1 text-danger",
  success: "border-success/30 bg-surface-1 text-success",
};

export function ToastStack() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current?.lastElementChild) {
      slideUpFromBottom(containerRef.current.lastElementChild);
    }
  }, [toasts.length]);

  if (toasts.length === 0) return null;

  return (
    <div ref={containerRef} className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm shadow-lg ${VARIANT_CLASSES[toast.variant]}`}
        >
          <span>{toast.message}</span>
          <button onClick={() => dismiss(toast.id)} className="text-foreground-muted hover:text-foreground">
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
