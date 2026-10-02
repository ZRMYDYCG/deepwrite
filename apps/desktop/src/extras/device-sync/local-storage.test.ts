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
    const { store } = await createStore();
    await store.write(metadata());

    storage.brokenDecrypt = true;
    const read = await store.read();
    const item = read!.baselines["model-config:model_writer"]!.item!;
    expect(Object.keys(item.files)).toEqual(["deepwrite.json"]);
    expect(read!.deviceId).toBe("device_1");
  });

  it("reads metadata written before keys were synced, and returns null when absent", async () => {
    const { root, store } = await createStore();
    expect(await store.read()).toBeNull();

    const plain: SyncMetadata = { ...metadata(), baselines: {} };
    await writeFile(join(root, "device-sync.json"), JSON.stringify(plain));
    expect(await store.read()).toEqual(plain);
  });
});
