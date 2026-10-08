import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  syncModelConfigItem,
  syncModelConfigSchema,
  type SyncMetadata
} from "@deepwrite/contracts";

const storage = vi.hoisted(() => ({ available: true, brokenDecrypt: false }));

vi.mock("electron", () => ({
  safeStorage: {
    isEncryptionAvailable: () => storage.available,
    getSelectedStorageBackend: () => "keychain",
    encryptString: (value: string) =>
      Buffer.from(`locked:${Buffer.from(value).toString("hex")}`, "utf8"),
    decryptString: (value: Buffer) => {
      if (storage.brokenDecrypt) throw new Error("decrypt failed");
      return Buffer.from(
        value.toString("utf8").replace("locked:", ""),
        "hex"
      ).toString("utf8");
    }
  }
}));

const { DesktopSyncMetadataStore } = await import("./local-storage");

const KEY = "sk-sync-test-only-0123456789";
const NOW = "2026-09-08T01:00:00.000Z";
const config = syncModelConfigSchema.parse({
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
});

function metadata(): SyncMetadata {
  const item = syncModelConfigItem(config, KEY);
  return {
    schemaVersion: 1,
    deviceId: "device_1",
    config: null,
    baselines: {
      "model-config:model_writer": {
        revision: {
          kind: "model-config",
          id: "model_writer",
          title: "写作模型",
          clock: { device_1: 1 },
          files: null
        },
        item
      }
    },
    ancestors: {},
    published: null,
    history: [],
    lastSuccessAt: null,
    firstSyncConfirmed: true,
    lastCheckedAt: null,
    devices: [],
    pendingIssues: []
  };
}

const roots: string[] = [];
async function createStore() {
  const root = await mkdtemp(join(tmpdir(), "deepwrite-sync-metadata-"));
  roots.push(root);
  return { root, store: new DesktopSyncMetadataStore(root) };
}

beforeEach(() => {
  storage.available = true;
  storage.brokenDecrypt = false;
});
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("DesktopSyncMetadataStore", () => {
  it("keeps API keys out of the file on disk and restores them on read", async () => {
    const { root, store } = await createStore();
    await store.write(metadata());

    const onDisk = await readFile(join(root, "device-sync.json"), "utf8");
    expect(onDisk).not.toContain(KEY);
    expect(onDisk).toContain("sealed:v1:");
    expect(await store.read()).toEqual(metadata());
  });

  it("seals a copy for writers that store sync state themselves, and refuses when secure storage is unavailable", async () => {
    const { root, store } = await createStore();
    const sealed = await store.seal(metadata());
    expect(JSON.stringify(sealed)).not.toContain(KEY);
    expect(JSON.stringify(sealed)).toContain("sealed:v1:");
    // Writing an already sealed copy keeps it sealed and readable.
    await store.write(sealed);
    expect(
      await readFile(join(root, "device-sync.json"), "utf8")
    ).not.toContain(KEY);
    expect(await store.read()).toEqual(metadata());

    storage.available = false;
    await expect(store.seal(metadata())).rejects.toThrow("安全存储");
  });

  it("refuses to write a key as plaintext when secure storage is unavailable", async () => {
    const { root, store } = await createStore();
    storage.available = false;

    await expect(store.write(metadata())).rejects.toThrow("安全存储");
    await expect(
      readFile(join(root, "device-sync.json"), "utf8")
    ).rejects.toThrow();
  });

  it("drops a key it cannot decrypt instead of failing the whole sync state", async () => {
    const { root, store } = await createStore();
    await store.write(metadata());

    storage.brokenDecrypt = true;
    const read = await new DesktopSyncMetadataStore(root).read();
    const item = read!.baselines["model-config:model_writer"]!.item!;
    expect(Object.keys(item.files)).toEqual(["deepwrite.json"]);
    expect(read!.deviceId).toBe("device_1");
  });

  it("serves reads from memory after a write, as one frozen value with usable keys", async () => {
    const { root, store } = await createStore();
    await store.write(metadata());
    await writeFile(join(root, "device-sync.json"), "{damaged");

    const first = await store.read();
    expect(first).toEqual(metadata());
    expect(await store.read()).toBe(first);
    expect(Object.isFrozen(first?.baselines)).toBe(true);
    // A restart reads the file again.
    await expect(new DesktopSyncMetadataStore(root).read()).rejects.toThrow();
  });

  it("keeps writes in call order and isolates the cache from the caller's objects", async () => {
    const { root, store } = await createStore();
    const second = { ...metadata(), lastCheckedAt: NOW };
    const writes = Promise.all([store.write(metadata()), store.write(second)]);
    second.deviceId = "device_changed";
    await writes;

    expect(await store.read()).toMatchObject({
      deviceId: "device_1",
      lastCheckedAt: NOW
    });
    expect(
      (await new DesktopSyncMetadataStore(root).read())?.lastCheckedAt
    ).toBe(NOW);
  });

  it("reads the file again after a failed write", async () => {
    const { root, store } = await createStore();
    await store.write(metadata());
    storage.available = false;
    await expect(store.write(metadata())).rejects.toThrow("安全存储");
    storage.available = true;
    const plain: SyncMetadata = { ...metadata(), baselines: {} };
    await writeFile(join(root, "device-sync.json"), JSON.stringify(plain));
    expect(await store.read()).toEqual(plain);
  });

  it("reads metadata written before keys were synced, and returns null when absent", async () => {
    const { root, store } = await createStore();
    expect(await store.read()).toBeNull();

    const plain: SyncMetadata = { ...metadata(), baselines: {} };
    await writeFile(join(root, "device-sync.json"), JSON.stringify(plain));
    expect(await store.read()).toEqual(plain);
  });
});
