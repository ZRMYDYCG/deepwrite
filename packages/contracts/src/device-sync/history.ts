import type { SyncItem, SyncMetadata } from "./schemas";
import { sameSyncContent, syncEqual } from "./value";

/** Restorable versions kept per work; every snapshot holds a full copy of the work. */
export const SYNC_HISTORY_VERSIONS_PER_ITEM = 1;

/**
 * Keeps one restorable version per work: the newest that differs from the work's current version, since that is
 * the one worth going back to, or else the newest. A work without any snapshot keeps its newest record.
 * History is ordered newest first and keeps that order.
 */
export function compactSyncHistory<
  T extends { key: string; item: SyncItem | null }
>(history: readonly T[], currentOf: (key: string) => SyncItem | null): T[] {
  const byKey = new Map<string, T[]>();
  for (const entry of history) {
    const entries = byKey.get(entry.key);
    if (entries) entries.push(entry);
    else byKey.set(entry.key, [entry]);
  }
  const kept = new Set<T>();
  for (const [key, entries] of byKey) {
    const current = currentOf(key);
    const different: T[] = [];
    const same: T[] = [];
    for (const entry of entries) {
      if (!entry.item) continue;
      if (different.length >= SYNC_HISTORY_VERSIONS_PER_ITEM) break;
      (sameSyncContent(entry.item, current) ? same : different).push(entry);
    }
    const chosen = [...different, ...same].slice(
      0,
      SYNC_HISTORY_VERSIONS_PER_ITEM
    );
    for (const entry of chosen.length ? chosen : entries.slice(0, 1))
      kept.add(entry);
  }
  return history.filter((entry) => kept.has(entry));
}

/**
 * Drops what the sync state stores twice or no longer needs: ancestors equal to their work's current baseline
 * (the merge always considers the baseline itself) and history beyond one version per work.
 */
export function compactSyncMetadata(metadata: SyncMetadata): SyncMetadata {
  const ancestors: SyncMetadata["ancestors"] = {};
  for (const [key, records] of Object.entries(metadata.ancestors)) {
    const baseline = metadata.baselines[key]?.revision;
    const kept = baseline
      ? records.filter((entry) => !syncEqual(entry.revision, baseline))
      : records;
    if (kept.length) ancestors[key] = kept;
  }
  return {
    ...metadata,
    ancestors,
    history: compactSyncHistory(
      metadata.history,
      (key) => metadata.baselines[key]?.item ?? null
    )
  };
}
