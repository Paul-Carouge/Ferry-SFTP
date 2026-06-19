import type { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      {icon && <div className="mb-2 text-foreground-muted">{icon}</div>}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="max-w-sm text-sm text-foreground-muted">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
