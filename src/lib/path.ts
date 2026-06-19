export function joinPath(base: string, name: string): string {
  if (base === "/") return `/${name}`;
  return `${base.replace(/\/+$/, "")}/${name}`;
}

export function parentPath(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  const idx = trimmed.lastIndexOf("/");
  if (idx <= 0) return "/";
  return trimmed.slice(0, idx);
}

export function baseName(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  const idx = trimmed.lastIndexOf("/");
  return idx === -1 ? trimmed : trimmed.slice(idx + 1);
}

export function pathSegments(path: string): { label: string; path: string }[] {
  const parts = path.split("/").filter(Boolean);
  const segments = [{ label: "/", path: "/" }];
  let acc = "";
  for (const part of parts) {
    acc += `/${part}`;
    segments.push({ label: part, path: acc });
  }
  return segments;
}
