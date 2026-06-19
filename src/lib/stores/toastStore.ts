import { create } from "zustand";

export interface Toast {
  id: string;
  message: string;
  variant: "info" | "error" | "success";
}

interface ToastState {
  toasts: Toast[];
  push: (message: string, variant?: Toast["variant"]) => void;
  dismiss: (id: string) => void;
}

let counter = 0;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (message, variant = "info") => {
    const id = `toast-${++counter}`;
    set((state) => ({ toasts: [...state.toasts, { id, message, variant }] }));
    setTimeout(() => get().dismiss(id), 4000);
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));
