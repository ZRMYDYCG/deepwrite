import { SYNC_MODEL_SECRET_FILE } from "./model-config";
import type { SyncItem, SyncMetadata } from "./schemas";
import type { SyncIssue } from "./types";
import { stableSyncJson } from "./value";

const SEALED_PREFIX = "sealed:v1:";
const MASK = "••••";

/** Seals secret file content for local storage; `open` yields null when it is unreadable. */
export interface SyncSecretSealer {
  seal(content: string): Promise<string>;
  open(sealed: string): Promise<string | null>;
}

/** A display-only value: the key stays hidden and only a long key shows its tail. */
export function maskSyncSecret(value: string): string {
  return value.length >= 16 ? `${MASK}${value.slice(-4)}` : MASK;
}

function secretOf(content: string): string {
  try {
    const apiKey = (JSON.parse(content) as { apiKey?: unknown }).apiKey;
    return typeof apiKey === "string" ? apiKey : "";
  } catch {
    return "";
  }
}

/** Items shown in the UI never carry a usable API key. */
export function redactSyncItem(item: SyncItem | null): SyncItem | null {
  const content = item?.files[SYNC_MODEL_SECRET_FILE];
  if (!item || item.kind !== "model-config" || content === undefined)
    return item;
  return {
    ...item,
    files: {
      ...item.files,
      [SYNC_MODEL_SECRET_FILE]: stableSyncJson({
        apiKey: maskSyncSecret(secretOf(content))
      })
    }
  };
}

export function redactSyncIssue(issue: SyncIssue): SyncIssue {
  return {
    ...issue,
    local: redactSyncItem(issue.local),
    ...(issue.base === undefined ? {} : { base: redactSyncItem(issue.base) }),
    versions: issue.versions.map((version) => ({
      ...version,
      item: redactSyncItem(version.item)
    }))
  };
}

type ContentMap = (content: string) => Promise<string | null>;

async function mapItem(
  item: SyncItem | null,
  map: ContentMap
): Promise<SyncItem | null> {
  const content = item?.files[SYNC_MODEL_SECRET_FILE];
  if (!item || item.kind !== "model-config" || content === undefined)
    return item;
  const next = await map(content);
  const files = Object.fromEntries(
    Object.entries(item.files).filter(
      ([path]) => path !== SYNC_MODEL_SECRET_FILE
    )
  );
  return {
    ...item,
    files: next === null ? files : { ...files, [SYNC_MODEL_SECRET_FILE]: next }
  };
}

async function mapMetadata(
  metadata: SyncMetadata,
  map: ContentMap
): Promise<SyncMetadata> {
  const baselines: SyncMetadata["baselines"] = {};
  for (const [key, entry] of Object.entries(metadata.baselines))
    baselines[key] = { ...entry, item: await mapItem(entry.item, map) };
  const ancestors: SyncMetadata["ancestors"] = {};
  for (const [key, entries] of Object.entries(metadata.ancestors)) {
    ancestors[key] = [];
    for (const entry of entries)
      ancestors[key].push({ ...entry, item: await mapItem(entry.item, map) });
  }
  const history: SyncMetadata["history"] = [];
  for (const entry of metadata.history)
    history.push({ ...entry, item: await mapItem(entry.item, map) });
  const pendingIssues: SyncMetadata["pendingIssues"] = [];
  for (const issue of metadata.pendingIssues) {
    const versions: SyncIssue["versions"] = [];
    for (const version of issue.versions)
      versions.push({ ...version, item: await mapItem(version.item, map) });
    pendingIssues.push({
      ...issue,
      local: await mapItem(issue.local, map),
      ...(issue.base === undefined
        ? {}
        : { base: await mapItem(issue.base, map) }),
      versions
    });
  }
  return { ...metadata, baselines, ancestors, history, pendingIssues };
}

/** Replaces every API key in local sync state with an opaque sealed value. */
export function sealSyncMetadata(
  metadata: SyncMetadata,
  sealer: SyncSecretSealer
): Promise<SyncMetadata> {
  return mapMetadata(metadata, async (content) =>
    content.startsWith(SEALED_PREFIX)
      ? content
      : `${SEALED_PREFIX}${await sealer.seal(content)}`
  );
}

/** Restores sealed keys; an unreadable one is dropped so the item just looks re-added. */
export function openSyncMetadata(
  metadata: SyncMetadata,
  sealer: SyncSecretSealer
): Promise<SyncMetadata> {
  return mapMetadata(metadata, async (content) =>
    content.startsWith(SEALED_PREFIX)
      ? sealer.open(content.slice(SEALED_PREFIX.length))
      : content
  );
}
