import { describe, expect, it } from "vitest";
import { syncModelConfigItem, syncModelConfigSchema } from "./model-config";
import {
  maskSyncSecret,
  openSyncMetadata,
  redactSyncIssue,
  redactSyncItem,
  sealSyncMetadata,
  type SyncSecretSealer
} from "./secret-protection";
import type { SyncItem, SyncMetadata } from "./schemas";
import type { SyncIssue } from "./types";

const KEY = "sk-sync-test-only-0123456789";
const revision = (item: SyncItem) => ({
  kind: item.kind,
  id: item.id,
  title: item.title,
  clock: { device_1: 1 },
  files: null
});

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
const modelItem = (apiKey?: string) => syncModelConfigItem(config, apiKey);
const book: SyncItem = {
  kind: "book",
  id: "book_one",
  title: "短篇",
  files: { "deepwrite.json": "{}", "draft.md": "正文" }
};

const reversible: SyncSecretSealer = {
  seal: async (content) =>
    Array.from(content, (char) =>
      char.charCodeAt(0).toString(16).padStart(4, "0")
    ).join(""),
  open: async (sealed) =>
    String.fromCharCode(
      ...(sealed.match(/.{4}/g) ?? []).map((code) => parseInt(code, 16))
    )
};
const unreadable: SyncSecretSealer = { ...reversible, open: async () => null };

function metadata(): SyncMetadata {
  const item = modelItem(KEY);
  const issue: SyncIssue = {
    key: "model-config:model_writer",
    title: "写作模型",
    token: "token",
    reason: "conflict",
    message: "冲突",
    paths: ["secret.json"],
    local: item,
    base: item,
    versions: [{ deviceName: "手机", item, clock: { device_1: 1 } }]
  };
  return {
    schemaVersion: 1,
    deviceId: "device_1",
    config: null,
    baselines: {
      "model-config:model_writer": { revision: revision(item), item },
      "book:book_one": { revision: revision(book), item: book }
    },
    ancestors: {
      "model-config:model_writer": [{ revision: revision(item), item }]
    },
    published: null,
    history: [
      {
        id: "history_1",
        key: "model-config:model_writer",
        title: "写作模型",
        at: "2026-09-08T01:00:00.000Z",
        description: "已同步",
        item
      }
    ],
    lastSuccessAt: null,
    firstSyncConfirmed: true,
    lastCheckedAt: null,
    devices: [],
    pendingIssues: [issue]
  };
}

const secretFiles = (value: SyncMetadata): (string | undefined)[] => [
  value.baselines["model-config:model_writer"]?.item?.files["secret.json"],
  value.ancestors["model-config:model_writer"]?.[0]?.item?.files["secret.json"],
  value.history[0]?.item?.files["secret.json"],
  value.pendingIssues[0]?.local?.files["secret.json"],
  value.pendingIssues[0]?.base?.files["secret.json"],
  value.pendingIssues[0]?.versions[0]?.item?.files["secret.json"]
];

describe("maskSyncSecret", () => {
  it("hides short keys entirely and shows only the tail of long ones", () => {
    expect(maskSyncSecret("sk-short")).toBe("••••");
    expect(maskSyncSecret(KEY)).toBe("••••6789");
    expect(maskSyncSecret(KEY)).not.toContain("sk-");
  });
});

describe("redaction for the interface", () => {
  it("masks the key in a model item and leaves every other file and item alone", () => {
    const item = modelItem(KEY);
    const redacted = redactSyncItem(item)!;
    expect(redacted.files["secret.json"]).toBe('{"apiKey":"••••6789"}');
    expect(redacted.files["deepwrite.json"]).toBe(item.files["deepwrite.json"]);
    expect(JSON.stringify(redacted)).not.toContain(KEY);
    expect(redactSyncItem(book)).toBe(book);
    expect(redactSyncItem(null)).toBeNull();
    const noKey = modelItem();
    expect(redactSyncItem(noKey)).toBe(noKey);
  });

  it("masks a corrupt secret file instead of leaking it", () => {
    const item = modelItem(KEY);
    const corrupt = {
      ...item,
      files: { ...item.files, "secret.json": `not json ${KEY}` }
    };
    const redacted = redactSyncItem(corrupt)!;
    expect(redacted.files["secret.json"]).toBe('{"apiKey":"••••"}');
    expect(JSON.stringify(redacted)).not.toContain(KEY);
  });

  it("masks every version inside an issue", () => {
    const issue = metadata().pendingIssues[0]!;
    const redacted = redactSyncIssue(issue);
    expect(JSON.stringify(redacted)).not.toContain(KEY);
    expect(redacted.versions[0]!.item!.files["secret.json"]).toContain("••••");
    expect(redacted.key).toBe(issue.key);
  });
});

describe("sealing sync metadata at rest", () => {
  it("replaces every key with a sealed value and round-trips exactly", async () => {
    const original = metadata();
    const sealed = await sealSyncMetadata(original, reversible);
    expect(JSON.stringify(sealed)).not.toContain(KEY);
    for (const file of secretFiles(sealed)) expect(file).toMatch(/^sealed:v1:/);
    expect(sealed.baselines["book:book_one"]).toEqual(
      original.baselines["book:book_one"]
    );
    expect(await openSyncMetadata(sealed, reversible)).toEqual(original);
  });

  it("does not seal twice and does not mutate its input", async () => {
    const original = metadata();
    const before = structuredClone(original);
    const once = await sealSyncMetadata(original, reversible);
    expect(original).toEqual(before);
    const twice = await sealSyncMetadata(once, reversible);
    expect(twice).toEqual(once);
  });

  it("leaves metadata without keys untouched", async () => {
    const plain: SyncMetadata = {
      ...metadata(),
      baselines: {},
      ancestors: {},
      history: [],
      pendingIssues: []
    };
    expect(await sealSyncMetadata(plain, reversible)).toEqual(plain);
    expect(await openSyncMetadata(plain, unreadable)).toEqual(plain);
  });

  it("drops a key it cannot open so the item merely looks re-added", async () => {
    const sealed = await sealSyncMetadata(metadata(), reversible);
    const opened = await openSyncMetadata(sealed, unreadable);
    for (const file of secretFiles(opened)) expect(file).toBeUndefined();
    const item = opened.baselines["model-config:model_writer"]!.item!;
    expect(Object.keys(item.files)).toEqual(["deepwrite.json"]);
    expect(opened.baselines["book:book_one"]).toEqual(
      metadata().baselines["book:book_one"]
    );
  });

  it("never writes plaintext when sealing fails", async () => {
    const broken: SyncSecretSealer = {
      ...reversible,
      seal: async () => {
        throw new Error("系统安全存储不可用。");
      }
    };
    await expect(sealSyncMetadata(metadata(), broken)).rejects.toThrow(
      "安全存储"
    );
  });
});
