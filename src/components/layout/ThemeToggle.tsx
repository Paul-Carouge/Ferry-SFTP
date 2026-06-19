"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useT } from "@/lib/i18n/useT";

export function ThemeToggle() {
  const t = useT();
  const [dark, setDark] = useState(false);

  useEffect(() => {
    // Synced from the DOM (set pre-hydration by the inline theme script in layout.tsx)
    // rather than read during render, to avoid a server/client hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("ferry-theme", next ? "dark" : "light");
  }

  return (
    <button
      onClick={toggle}
      className="rounded-md p-1.5 text-foreground-muted hover:bg-surface-2 hover:text-foreground"
      title={t("topBar.toggleTheme")}
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
