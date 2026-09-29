import { syncProgressTitle } from "../../../localization/sync-display-text";
import {
  clockIncludes,
  mergeSyncClocks,
  stableSyncJson,
  syncDependencies,
  syncKey,
  type LoadedSyncDevice,
  type SyncInitializationPreview,
  type SyncItem,
  type SyncMetadata,
  type SyncRevision,
  type SyncServiceOptions
} from "@deepwrite/contracts";
import { connectedSyncRemote, loadSyncMetadata } from "./connection";
import type { SyncRunState } from "./run";

export interface PreparedSyncInitialization {
  preview: SyncInitializationPreview;
  items: SyncItem[];
  baselines: SyncMetadata["baselines"];
  devices: LoadedSyncDevice[];
  localFingerprint: string;
  metadataFingerprint: string;
}
const TTL = 10 * 60 * 1000;
function metadataFingerprint(metadata: SyncMetadata): string {
  const { config, deviceId, published, baselines, history } = metadata;
  return stableSyncJson({ config, deviceId, published, baselines, history });
}
function deviceVersions(devices: LoadedSyncDevice[]): string {
  return stableSyncJson(
    devices.map(({ hash, commit }) => [commit.deviceId, hash]).sort()
  );
}
function checkCancelled(signal: AbortSignal): void {
  if (signal.aborted) throw new Error("同步已取消。");
}
function fileHashes(revision: SyncRevision): string {
  return stableSyncJson(
    revision.files
      ? Object.fromEntries(
          Object.entries(revision.files).map(([path, ref]) => [path, ref.hash])
        )
      : null
  );
}

/** Require the chosen computer to have incorporated other published versions first. */
function checkSource(
  source: LoadedSyncDevice,
  devices: LoadedSyncDevice[]
): void {
  for (const { commit } of devices)
    for (const [key, revision] of Object.entries(commit.items)) {
      const chosen = source.commit.items[key];
      if (
        (!chosen && revision.files) ||
        (chosen && !clockIncludes(chosen.clock, revision.clock))
      ) {
        throw new Error("远端还有未合并的版本，请先在来源设备完成同步后重试。");
      }
      if (
        chosen &&
        stableSyncJson(chosen.clock) === stableSyncJson(revision.clock) &&
        fileHashes(chosen) !== fileHashes(revision)
      ) {
        throw new Error("远端还有未合并的版本，请先在来源设备完成同步后重试。");
      }
    }
}

export async function prepareSyncInitialization(
  options: SyncServiceOptions,
  state: SyncRunState,
  deviceId: string,
  signal: AbortSignal
): Promise<PreparedSyncInitialization> {
  const port = options.workspace.initialization;
  if (!port) throw new Error("当前环境不支持初始化本机。");
  const metadata = await loadSyncMetadata(options);
  if (!metadata.config?.spaceId) throw new Error("请先连接并选择同步空间。");
  state.progress = {
    phase: "checking",
    completed: 0,
    total: 0,
    ...syncProgressTitle("checkingSource")
  };
  await options.workspace.recover();
  const local = await port.inspect();
  const remote = await connectedSyncRemote(options, metadata.config, signal);
  const devices = await remote.devices(metadata.config.spaceId);
  const source = devices.find(
    ({ commit }) =>
      commit.deviceId === deviceId && deviceId !== metadata.deviceId
  );
  if (!source) throw new Error("请先选择另一台已上传数据的设备。");
  checkSource(source, devices);
  const revisions = Object.entries(source.commit.items);
  const total = revisions.filter(([, revision]) => revision.files).length;
  if (!total)
    throw new Error("来源设备没有可下载的作品或资料，未清除本机数据。");
  const items: SyncItem[] = [];
  const baselines: SyncMetadata["baselines"] = {};
  remote.setFileProgress((filesCompleted, filesTotal) => {
    state.progress = { ...state.progress, filesCompleted, filesTotal };
  });
  for (const [key, revision] of revisions) {
    checkCancelled(signal);
    state.progress = {
      phase: "transferring",
      completed: items.length,
      total,
      ...syncProgressTitle("downloadingSource", { title: revision.title })
    };
    try {
      const item = await remote.item(metadata.config.spaceId, revision);
      if (item) {
        await options.workspace.validate(item);
        items.push(item);
      }
      baselines[key] = { revision, item };
    } catch {
      checkCancelled(signal);
      throw new Error("远端作品不完整或不兼容，请先在来源设备更新并重新上传。");
    }
  }
  const keys = new Set(items.map(syncKey));
  if (
    items.some((item) => syncDependencies(item).some((key) => !keys.has(key)))
  ) {
    throw new Error(
      "远端作品绑定的资料不完整，请先在来源设备同步全部作品和资料库。"
    );
  }
  // Already published deletions absent from the source must not appear as new downloads.
  for (const { commit } of devices)
    for (const [key, revision] of Object.entries(commit.items)) {
      if (!source.commit.items[key] && !revision.files)
        baselines[key] = {
          revision: {
            ...revision,
            clock: mergeSyncClocks([
              baselines[key]?.revision.clock ?? {},
              revision.clock
            ])
          },
          item: null
        };
    }
  checkCancelled(signal);
  const preview: SyncInitializationPreview = {
    token: options.runtime.id(),
    deviceId,
    deviceName: source.commit.deviceName,
    remoteUpdatedAt: source.commit.createdAt,
    remoteHash: source.hash,
    itemCount: items.length,
    fileCount: items.reduce(
      (sum, item) => sum + Object.keys(item.files).length,
      0
    ),
    localItemCount: local.itemCount,
    expiresAt: new Date(Date.parse(options.runtime.now()) + TTL).toISOString()
  };
  state.progress = {
    phase: "idle",
    completed: items.length,
    total,
    ...syncProgressTitle("sourceReady")
  };
  return {
    preview,
    items,
    baselines,
    devices,
    localFingerprint: local.fingerprint,
    metadataFingerprint: metadataFingerprint(metadata)
  };
}

export async function applySyncInitialization(
  options: SyncServiceOptions,
  state: SyncRunState,
  prepared: PreparedSyncInitialization | null,
  token: string,
  signal: AbortSignal
): Promise<void> {
  const port = options.workspace.initialization;
  if (!port) throw new Error("当前环境不支持初始化本机。");
  if (
    !prepared ||
    token !== prepared.preview.token ||
    Date.parse(options.runtime.now()) >= Date.parse(prepared.preview.expiresAt)
  ) {
    throw new Error("初始化预览已过期，请重新下载预览。");
  }
  const metadata = await loadSyncMetadata(options);
  if (
    !metadata.config?.spaceId ||
    metadataFingerprint(metadata) !== prepared.metadataFingerprint
  ) {
    throw new Error("本机数据已变化，请重新下载预览后确认。");
  }
  state.progress = {
    phase: "checking",
    completed: 0,
    total: prepared.items.length,
    ...syncProgressTitle("recheckingRemote")
  };
  const remote = await connectedSyncRemote(options, metadata.config, signal);
  const devices = await remote.devices(metadata.config.spaceId);
  if (deviceVersions(devices) !== deviceVersions(prepared.devices)) {
    throw new Error("远端数据已更新，请重新下载预览后确认。");
  }
  checkCancelled(signal);
  const at = options.runtime.now();
  const next: SyncMetadata = {
    ...metadata,
    config: { ...metadata.config, excludedKeys: [] },
    baselines: prepared.baselines,
    ancestors: {},
    history: [],
    pendingIssues: [],
    devices,
    firstSyncConfirmed: true,
    lastCheckedAt: at,
    lastSuccessAt: at
  };
  state.progress = {
    phase: "applying",
    completed: 0,
    total: prepared.items.length,
    ...syncProgressTitle("replacingLocal")
  };
  await port.replace(prepared.items, next, prepared.localFingerprint, signal);
  state.issues = [];
  state.progress = {
    phase: "complete",
    completed: prepared.items.length,
    total: prepared.items.length,
    ...syncProgressTitle("initialized", {
      device: prepared.preview.deviceName,
      count: prepared.items.length
    })
  };
}
