export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exp;
  return `${exp === 0 ? value : value.toFixed(value < 10 ? 1 : 0)} ${units[exp]}`;
}

export function formatSpeed(bytesPerSecond: number): string {
  if (!bytesPerSecond || bytesPerSecond <= 0) return "";
  return `${formatBytes(bytesPerSecond)}/s`;
}

export function formatEta(bytesRemaining: number, bytesPerSecond: number): string {
  if (!bytesPerSecond || bytesPerSecond <= 0) return "";
  const seconds = bytesRemaining / bytesPerSecond;
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  if (seconds < 3600) return `${Math.ceil(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

export function formatDate(ms: number | null): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelativeTime(ms: number | null): string {
  if (!ms) return "never";
  const diff = Date.now() - ms;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function permissionsToString(mode: number | null): string {
  if (mode === null || mode === undefined) return "—";
  const perm = mode & 0o777;
  const types = ["---", "--x", "-w-", "-wx", "r--", "r-x", "rw-", "rwx"];
  const owner = types[(perm >> 6) & 0b111];
  const group = types[(perm >> 3) & 0b111];
  const other = types[perm & 0b111];
  return `${owner}${group}${other}`;
}
