"use client";

import { Moon, Sun } from "lucide-react";
import { useUiStore } from "@/lib/stores/uiStore";
import { useT } from "@/lib/i18n/useT";

export function ThemeToggle() {
  const t = useT();
  const dark = useUiStore((s) => s.isDark);
  const toggleTheme = useUiStore((s) => s.toggleTheme);

  return (
    <button
      onClick={toggleTheme}
      className="rounded-md p-1.5 text-foreground-muted hover:bg-surface-2 hover:text-foreground"
      title={t("topBar.toggleTheme")}
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
