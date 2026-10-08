import type { SyncItem, SyncMetadata, SyncRevision } from "./schemas";
import { clockIncludes, sameSyncContent, syncEqual } from "./value";

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

type Baseline = SyncMetadata["baselines"][string];

/**
 * Ancestors only serve as merge bases, and a merge uses the newest version that the baseline and every incoming
 * version contain. Once every other device holds a version, clocks only grow, so that version stays common in
 * every later merge and any ancestor older than it can never be chosen again.
 */
function mergeBases(
  records: Baseline[],
  baseline: Baseline,
  others: SyncRevision[]
): Baseline[] {
  const settled = [...records, baseline].filter((entry) =>
    others.every((revision) =>
      clockIncludes(revision.clock, entry.revision.clock)
    )
  );
  return records.filter(
    (entry) =>
      !syncEqual(entry.revision, baseline.revision) &&
      !settled.some(
        (newer) =>
          clockIncludes(newer.revision.clock, entry.revision.clock) &&
          !clockIncludes(entry.revision.clock, newer.revision.clock)
      )
  );
}

/**
 * Drops what the sync state stores twice or no longer needs: ancestors no later merge can use (each one is a full
 * copy of the work) and history beyond one version per work.
 */
export function compactSyncMetadata(metadata: SyncMetadata): SyncMetadata {
  const others = metadata.devices.filter(
    ({ commit }) => commit.deviceId !== metadata.deviceId
  );
  const ancestors: SyncMetadata["ancestors"] = {};
  for (const [key, records] of Object.entries(metadata.ancestors)) {
    const baseline = metadata.baselines[key];
    const kept = baseline
      ? mergeBases(
          records,
          baseline,
          others.flatMap(({ commit }) => commit.items[key] ?? [])
        )
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
