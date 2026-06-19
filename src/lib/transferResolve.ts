import { transfersApi, type TransferDirection, type TransferPlanItem } from "@/lib/api";

export interface ConflictChoice {
  resolution: "skip" | "overwrite" | "rename";
  applyToAll: boolean;
}

export type ConflictResolver = (path: string) => Promise<ConflictChoice>;

function withSuffix(path: string, n: number): string {
  const slash = path.lastIndexOf("/");
  const dir = slash >= 0 ? path.slice(0, slash + 1) : "";
  const name = slash >= 0 ? path.slice(slash + 1) : path;
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  return `${dir}${base} (${n})${ext}`;
}

function pickNonConflicting(path: string, taken: Set<string>): string {
  let n = 1;
  let candidate = withSuffix(path, n);
  while (taken.has(candidate)) {
    n += 1;
    candidate = withSuffix(path, n);
  }
  taken.add(candidate);
  return candidate;
}

/**
 * Checks for destination conflicts, resolves each via `resolveConflict`
 * (skip/overwrite/rename, with "apply to all" short-circuiting the rest),
 * then enqueues whatever's left as one transfer job. Directories pass
 * through unresolved (only files can conflict).
 */
export async function resolveAndEnqueue(
  connectionId: string,
  direction: TransferDirection,
  items: TransferPlanItem[],
  resolveConflict: ConflictResolver,
): Promise<string | null> {
  const conflicts = await transfersApi.checkConflicts(connectionId, direction, items);
  if (conflicts.length === 0) {
    return transfersApi.enqueueResolved(connectionId, direction, items);
  }

  const destOf = (item: TransferPlanItem) => (direction === "upload" ? item.remotePath : item.localPath);
  const taken = new Set(conflicts);
  const conflictSet = new Set(conflicts);
  let applyAll: ConflictChoice["resolution"] | null = null;
  const resolved: TransferPlanItem[] = [];

  for (const item of items) {
    if (item.isDir || !conflictSet.has(destOf(item))) {
      resolved.push(item);
      continue;
    }
    const choice: ConflictChoice = applyAll
      ? { resolution: applyAll, applyToAll: true }
      : await resolveConflict(destOf(item));
    if (choice.applyToAll) applyAll = choice.resolution;

    if (choice.resolution === "skip") continue;
    if (choice.resolution === "overwrite") {
      resolved.push(item);
      continue;
    }
    const renamed = pickNonConflicting(destOf(item), taken);
    resolved.push(
      direction === "upload" ? { ...item, remotePath: renamed } : { ...item, localPath: renamed },
    );
  }

  if (resolved.every((i) => i.isDir)) return null;
  return transfersApi.enqueueResolved(connectionId, direction, resolved);
}
