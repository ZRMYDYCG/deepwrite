import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  realpath,
  writeFile
} from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createEnvelope,
  DeviceSyncWorkspaceCommandEnvelopeSchema,
  openSyncMetadata,
  sealSyncMetadata,
  syncModelConfigItem,
  syncModelConfigSchema,
  type DeviceSyncWorkspaceRequest,
  type SyncMetadata,
  type SyncMetadataStore,
  type SyncSecretSealer
} from "@deepwrite/contracts";
import { createInitializationWorkspace } from "./initialization-workspace";
import { connect, device, MemoryDav } from "./engine/sync-test-support";
import {
  makeTemporaryRoot,
  FolderCatalogStore,
  catalogFixture
} from "../../utilities/folder-catalog-store.test-support";
import { LongWorkspaceService } from "../../utilities/long-workspace-service";
import { withDeviceSyncCommands } from "../../utilities/device-sync-core";
import { desktopSyncInventory } from "../../utilities/device-sync-inventory";
import { INITIALIZATION_RECEIPT } from "../../utilities/device-sync-initialization-inspection";

async function setup() {
  const root = await realpath(
    await makeTemporaryRoot("deepwrite-init-bridge-")
  );
  const catalog = new FolderCatalogStore({ userDataPath: root });
  const long = new LongWorkspaceService({ userDataPath: root });
  await catalog.migrateSnapshot(catalogFixture());
  const items = (await desktopSyncInventory(root)).items;
  const dav = new MemoryDav();
  const client = device("pc", dav);
  await client.service.status();
  const previous = client.metadata()!;
  const next = { ...previous, firstSyncConfirmed: true };
  const core = withDeviceSyncCommands(
    root,
    async () => catalog,
    long,
    async (command) => ({
      status: "accepted",
      requestId: command.id,
      payload: {}
    })
  );
  const request = async (input: DeviceSyncWorkspaceRequest) => {
    const result = await core(
      DeviceSyncWorkspaceCommandEnvelopeSchema.parse(
        createEnvelope("deviceSync.workspace", input, {
          id: "test_request",
          correlationId: "test_request"
        })
      )
    );
    if (result.status !== "accepted") throw new Error(result.error.message);
    return result.payload;
  };
  const options = {
    request,
    workspaceDirectory: async () => join(root, "works"),
    busy: () => false,
    seal: async (value: SyncMetadata) => value
  };
  const makeBridge = (
    metadata: SyncMetadataStore = client.options.metadata,
    seal: typeof options.seal = options.seal
  ) => createInitializationWorkspace(root, metadata, { ...options, seal });
  return { root, client, dav, previous, next, items, options, makeBridge };
}

describe("初始化跨 Main/Core 恢复", () => {
  it("手机上传后，PC 普通下载被坏目录挡住，初始化后可打开并继续增量同步", async () => {
    const { root, client, dav, items, makeBridge } = await setup();
    const phone = device("phone", dav, items);
    const space = await connect(phone);
    await phone.service.sync([], true);
    const bridge = makeBridge();
    client.options.workspace.list = () => desktopSyncInventory(root);
    client.options.workspace.recover = bridge.recover;
    client.options.workspace.initialization = bridge.initialization;
    const { syncRegistrations } =
      await import("../../utilities/device-sync-inventory");
    const broken = (await syncRegistrations(root))[0]!;
    await writeFile(join(broken.root, "deepwrite.json"), "broken manifest");
    await connect(client, space);
    expect(
      (await client.service.sync([], true, "download")).issues.some(
        (issue) => issue.reason === "unsupported"
      )
    ).toBe(true);
    const remoteBefore = [...dav.files];
    const preview = await client.service.previewInitialization(
      phone.metadata()!.deviceId
    );
    const status = await client.service.initializeFromRemote(preview.token);
    expect(status.issues).toEqual([]);
    expect(status.items.every((item) => !item.dirty && !item.remoteDirty)).toBe(
      true
    );
    expect([...dav.files]).toEqual(remoteBefore);
    const repeated = await client.service.sync([], false, "download");
    expect(repeated.issues).toEqual([]);
    expect(repeated.progress.completed).toBe(0);
  }, 20_000);

  it("Core 已提交但 Main 写入基线失败时，重启恢复同一份基线且只恢复一次", async () => {
    const { root, client, previous, next, items, makeBridge } = await setup();
    let fail = true;
    let writes = 0;
    const metadata: SyncMetadataStore = {
      read: client.options.metadata.read,
      write: async (value) => {
        if (fail) throw new Error("simulated metadata failure");
        writes++;
        await client.options.metadata.write(value);
      }
    };
    const bridge = makeBridge(metadata);
    const inspection = await bridge.initialization.inspect();
    await expect(
      bridge.initialization.replace(
        items,
        next,
        inspection.fingerprint,
        new AbortController().signal
      )
    ).rejects.toThrow("simulated");
    expect(client.metadata()).toEqual(previous);
    expect(
      JSON.parse(await readFile(join(root, INITIALIZATION_RECEIPT), "utf8"))
        .token
    ).toBeTruthy();
    fail = false;
    await makeBridge(metadata).recover();
    expect(client.metadata()).toEqual(next);
    await makeBridge(metadata).recover();
    expect(writes).toBe(1);
    expect(await readdir(root)).not.toContain(
      "device-sync-initialization-metadata.json"
    );
    expect(
      (await readdir(join(root, "device-sync-recovery"))).some((path) =>
        path.startsWith("initialization-metadata-")
      )
    ).toBe(true);
  }, 20_000);

  it("Core 未通过指纹检查时，恢复不会错误推进基线", async () => {
    const { client, previous, next, items, makeBridge } = await setup();
    const bridge = makeBridge();
    await expect(
      bridge.initialization.replace(
        items,
        next,
        createHash("sha256").update("stale").digest("hex"),
        new AbortController().signal
      )
    ).rejects.toThrow("本机数据已变化");
    await makeBridge().recover();
    expect(client.metadata()).toEqual(previous);
  }, 20_000);

  it("取消或正在生成时不向 Core 提交初始化", async () => {
    const { root, next, items, makeBridge, options } = await setup();
    const bridge = makeBridge();
    const inspection = await bridge.initialization.inspect();
    const controller = new AbortController();
    controller.abort();
    await expect(
      bridge.initialization.replace(
        items,
        next,
        inspection.fingerprint,
        controller.signal
      )
    ).rejects.toThrow("取消");
    options.busy = () => true;
    await expect(
      makeBridge().initialization.replace(
        items,
        next,
        inspection.fingerprint,
        new AbortController().signal
      )
    ).rejects.toThrow("正在生成");
    expect(await readdir(root)).not.toContain(INITIALIZATION_RECEIPT);
  }, 20_000);

  it("Core 中断的注册表事务在接受下一条读取命令前完成", async () => {
    const { root, options } = await setup();
    const receipt = JSON.stringify({
      schemaVersion: 1,
      token: "interrupted",
      recoveryDirectory: "device-sync-recovery/test"
    });
    const hash = (text: string) =>
      createHash("sha256").update(text).digest("hex");
    const transactionId = "txn-1000-a1b2c3d4";
    const prefix = `.deepwrite/transactions/${transactionId}`;
    await mkdir(join(root, prefix, "stage"), { recursive: true });
    await mkdir(join(root, prefix, "backup"), { recursive: true });
    const previous = await readFile(
      join(root, "catalog-registry.json"),
      "utf8"
    );
    const current = `${previous}\n`;
    await writeFile(join(root, "catalog-registry.json"), current);
    await writeFile(join(root, prefix, "backup/0.previous"), previous);
    await writeFile(join(root, prefix, "stage/1.next"), receipt);
    await writeFile(
      join(root, ".deepwrite/transaction.json"),
      JSON.stringify({
        schemaVersion: 1,
        transactionId,
        phase: "committing",
        appliedCount: 1,
        operations: [
          {
            path: "catalog-registry.json",
            stagePath: `${prefix}/stage/0.next`,
            backupPath: `${prefix}/backup/0.previous`,
            beforeSha256: hash(previous),
            afterSha256: hash(current)
          },
          {
            path: INITIALIZATION_RECEIPT,
            stagePath: `${prefix}/stage/1.next`,
            backupPath: `${prefix}/backup/1.previous`,
            beforeSha256: null,
            afterSha256: hash(receipt)
          }
        ]
      })
    );
    expect(
      await options.request({ operation: "inspect-initialization" })
    ).toMatchObject({ lastToken: "interrupted" });
    expect(await readFile(join(root, INITIALIZATION_RECEIPT), "utf8")).toBe(
      receipt
    );
    expect(await readFile(join(root, "catalog-registry.json"), "utf8")).toBe(
      current
    );
    await expect(
      readFile(join(root, ".deepwrite/transaction.json"))
    ).rejects.toMatchObject({ code: "ENOENT" });
  }, 20_000);
});

const KEY = "sk-sync-test-only-0123456789";
const reversible: SyncSecretSealer = {
  seal: async (content) => Buffer.from(content, "utf8").toString("base64"),
  open: async (sealed) => Buffer.from(sealed, "base64").toString("utf8")
};
const modelItem = syncModelConfigItem(
  syncModelConfigSchema.parse({
    id: "model_writer",
    label: "写作模型",
    provider: "custom",
    modelId: "writer-v1",
    api: "openai-completions",
    baseUrl: "https://example.test/v1",
    reasoning: false,
    defaultThinkingLevel: "off",
    thinkingLevelOptions: ["minimal", "low", "medium", "high", "xhigh", "max"],
    temperatureOptions: [0.1, 0.7, 1]
  }),
  KEY
);
const withModelKey = (value: SyncMetadata): SyncMetadata => ({
  ...value,
  baselines: {
    ...value.baselines,
    "model-config:model_writer": {
      revision: {
        kind: "model-config",
        id: "model_writer",
        title: "写作模型",
        clock: { pc: 1 },
        files: null
      },
      item: modelItem
    }
  }
});
async function filesContaining(directory: string, text: string) {
  const found: string[] = [];
  for (const entry of await readdir(directory, {
    recursive: true,
    withFileTypes: true
  })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    if ((await readFile(path, "utf8")).includes(text)) found.push(path);
  }
  return found;
}

describe("初始化不留下明文 API Key", () => {
  it("恢复副本和待处理意图里的 Key 都已封存，恢复后写入的同步状态可还原", async () => {
    const { root, client, previous, next, items, makeBridge } = await setup();
    await client.options.metadata.write(withModelKey(previous));
    const target = withModelKey(next);
    const sealer = (value: SyncMetadata) => sealSyncMetadata(value, reversible);
    let fail = true;
    const written: SyncMetadata[] = [];
    const metadata: SyncMetadataStore = {
      read: client.options.metadata.read,
      write: async (value) => {
        if (fail) throw new Error("simulated metadata failure");
        written.push(value);
      }
    };
    const bridge = makeBridge(metadata, sealer);
    const inspection = await bridge.initialization.inspect();
    await expect(
      bridge.initialization.replace(
        items,
        target,
        inspection.fingerprint,
        new AbortController().signal
      )
    ).rejects.toThrow("simulated");
    // The intent file is still on disk here, as after a crash before recovery.
    expect(await readdir(root)).toContain(
      "device-sync-initialization-metadata.json"
    );
    expect(await filesContaining(root, KEY)).toEqual([]);

    fail = false;
    await makeBridge(metadata, sealer).recover();
    expect(JSON.stringify(written)).not.toContain(KEY);
    expect(await filesContaining(root, KEY)).toEqual([]);
    expect(await openSyncMetadata(written[0]!, reversible)).toEqual(target);
    expect(
      (await readdir(join(root, "device-sync-recovery"))).some((path) =>
        path.startsWith("initialization-metadata-")
      )
    ).toBe(true);
  }, 20_000);

  it("无法封存 Key 时在提交给 Core 之前失败，没有留下任何明文或意图", async () => {
    const { root, client, previous, next, items, makeBridge } = await setup();
    await client.options.metadata.write(withModelKey(previous));
    const bridge = makeBridge(client.options.metadata, async () => {
      throw new Error("系统安全存储不可用。");
    });
    const inspection = await bridge.initialization.inspect();
    await expect(
      bridge.initialization.replace(
        items,
        withModelKey(next),
        inspection.fingerprint,
        new AbortController().signal
      )
    ).rejects.toThrow("安全存储");
    expect(await readdir(root)).not.toContain(INITIALIZATION_RECEIPT);
    expect(await readdir(root)).not.toContain(
      "device-sync-initialization-metadata.json"
    );
    expect(await filesContaining(root, KEY)).toEqual([]);
    expect(client.metadata()).toEqual(withModelKey(previous));
  }, 20_000);
});
