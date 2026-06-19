import { ChevronRight } from "lucide-react";
import { pathSegments } from "@/lib/path";

export function Breadcrumbs({ path, onNavigate }: { path: string; onNavigate: (path: string) => void }) {
  const segments = pathSegments(path);
  return (
    <div className="flex items-center gap-0.5 overflow-x-auto whitespace-nowrap text-sm text-foreground-muted">
      {segments.map((seg, i) => (
        <div key={seg.path} className="flex items-center gap-0.5">
          {i > 0 && <ChevronRight className="size-3 shrink-0" />}
          <button
            onClick={() => onNavigate(seg.path)}
            className={`rounded px-1 py-0.5 hover:bg-surface-2 hover:text-foreground ${
              i === segments.length - 1 ? "font-medium text-foreground" : ""
            }`}
          >
            {seg.label}
          </button>
        </div>
      ))}
    </div>
  );
}
