import { syncIssueMessage } from "../../../localization/sync-display-text";
import {
  syncDependencies,
  syncKey,
  type SyncIssue,
  type SyncItem,
  type SyncMetadata
} from "@deepwrite/contracts";

/** Check references against items actually accepted during this run. */
export function syncDependencyIssue(input: {
  key: string;
  title: string;
  initial: SyncItem | null;
  next: SyncItem | null;
  local: Map<string, SyncItem>;
  accepted: SyncMetadata["baselines"];
}): SyncIssue | null {
  const { key, title, initial, next, local, accepted } = input;
  const issue = {
    key,
    title,
    token: "",
    reason: "unsupported" as const,
    local: initial,
    versions: []
  };
  if (next) {
    const missing = syncDependencies(next).filter((dependency) =>
      accepted[dependency]
        ? !accepted[dependency]?.item
        : !local.has(dependency)
    );
    return missing.length
      ? {
          ...issue,
          ...syncIssueMessage("missingDependencies"),
          paths: missing
        }
      : null;
  }
  const live = new Map(local);
  for (const [id, value] of Object.entries(accepted)) {
    if (value.item) live.set(id, value.item);
    else live.delete(id);
  }
  const dependents = [...live.values()].filter(
    (item) => syncKey(item) !== key && syncDependencies(item).includes(key)
  );
  if (!dependents.length) return null;
  const sources = dependents.map((item) => `「${item.title}」`);
  return {
    ...issue,
    ...syncIssueMessage("referencedResource", { sources: sources.join(", ") }),
    paths: []
  };
}
